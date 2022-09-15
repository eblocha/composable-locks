import { Mutex } from "./mutex";
import { describe, it, expect } from "vitest";
import { RWMutex, RWLockType } from "./readwrite";
import * as fc from "fast-check";
import { asyncNOP } from "./test-utils";

const withRead = async (lock: RWMutex<[]>, cb: () => Promise<void>) => {
  const release = await lock.acquire("read");
  try {
    await cb();
  } finally {
    release();
  }
};

const withWrite = async (lock: RWMutex<[]>, cb: () => Promise<void>) => {
  const release = await lock.acquire("write");
  try {
    await cb();
  } finally {
    release();
  }
};

const newMutex = () => new RWMutex(() => new Mutex());

describe("Base RW Lock", () => {
  const arbitraryLockType = fc.oneof(
    fc.constant("read" as RWLockType),
    fc.constant("write" as RWLockType)
  );

  it("Maintains order", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbitraryLockType, { minLength: 2, maxLength: 20 }),
        async (locks: RWLockType[]) => {
          const lock = newMutex();
          const data: string[] = [];

          const expected = locks.map((type, index) => type + index.toString());

          const fn = (index: number) => {
            const e = expected[index];
            if (e) data.push(e);
            return Promise.resolve();
          };
          await Promise.all(
            locks.map((type, index) =>
              type === "read"
                ? withRead(lock, () => fn(index))
                : withWrite(lock, () => fn(index))
            )
          );
          expect(data).toStrictEqual(expected);
        }
      ),
      { timeout: 500 }
    );
  });

  it("Maintains order with uneven event loop ticks", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.tuple(arbitraryLockType, fc.integer({ min: 0, max: 10 })), {
          minLength: 2,
          maxLength: 20,
        }),
        async (pairs) => {
          const lock = newMutex();

          const data: string[] = [];
          const expected = pairs.map(
            ([type], index) => type + index.toString()
          );

          const ticks = pairs.map(([, ticks]) => ticks);
          const types = pairs.map(([type]) => type);

          const fn = async (index: number) => {
            const e = expected[index];
            if (e) data.push(e);
            const t = ticks[index] ?? 0;
            for (let i = 0; i < t; i++) {
              await asyncNOP();
            }
          };

          await Promise.all(
            types.map((type, index) =>
              type === "read"
                ? withRead(lock, () => fn(index))
                : withWrite(lock, () => fn(index))
            )
          );
          expect(data).toStrictEqual(expected);
        }
      ),
      { timeout: 500 }
    );
  });

  it("Starves writers if preferRead is true", async () => {
    type LockData = {
      type: RWLockType;
      index: number;
    };

    await fc.assert(
      fc.asyncProperty(
        fc.array(arbitraryLockType, { minLength: 2, maxLength: 20 }),
        async (locks: RWLockType[]) => {
          // inject read to force starvation behavior
          locks.splice(0, 0, "read");

          const lock = new RWMutex(() => new Mutex(), true);
          const data: string[] = [];
          const lockData: LockData[] = locks.map((type, index) => ({
            type,
            index,
          }));
          const reads = lockData.filter((data) => data.type === "read");
          const writes = lockData.filter((data) => data.type === "write");

          const toString = (type: RWLockType, index: number) =>
            `${type}${index}`;

          // reads all come before writers, in order
          const expected = [
            ...reads.map((data) => toString(data.type, data.index)),
            ...writes.map((data) => toString(data.type, data.index)),
          ];

          const fn = (type: RWLockType, index: number) => {
            data.push(toString(type, index));
            return Promise.resolve();
          };
          await Promise.all(
            locks.map((type, index) =>
              type === "read"
                ? withRead(lock, () => fn(type, index))
                : withWrite(lock, () => fn(type, index))
            )
          );
          expect(data).toStrictEqual(expected);
        }
      )
    );
  });

  it("Allows concurrent readers", async () => {
    const lock = newMutex();

    const data: string[] = [];
    await Promise.all([
      withRead(lock, async () => {
        await asyncNOP();
        data.push("data2");
      }),
      // eslint-disable-next-line @typescript-eslint/require-await
      withRead(lock, async () => {
        data.push("data1");
      }),
    ]);

    expect(data).toStrictEqual(["data1", "data2"]);
  });

  it("Forces syncronous writers", async () => {
    const lock = newMutex();

    const data: string[] = [];
    await Promise.all([
      withWrite(lock, async () => {
        await asyncNOP();
        data.push("data1");
      }),
      // eslint-disable-next-line @typescript-eslint/require-await
      withWrite(lock, async () => {
        data.push("data2");
      }),
    ]);

    expect(data).toStrictEqual(["data1", "data2"]);
  });

  it("release is idempotent", async () => {
    const lock = newMutex();

    const data: string[] = [];

    const write = async () => {
      const r = await lock.acquire("write");
      data.push("write");
      r();
    };

    // acquire 2 readers, but release 1 of them twice. Before releasing the second reader, try to acquire a writer.
    // The writer should finish last
    const release1 = await lock.acquire("read");
    const release2Promise = lock.acquire("read");
    data.push("read1");

    // try to trick the lock into thinking we released the second writer
    release1();
    release1();

    const p = write();

    const release2 = await release2Promise;

    data.push("read2");
    release2();

    await p;

    expect(data).toStrictEqual(["read1", "read2", "write"]);
  });
});
