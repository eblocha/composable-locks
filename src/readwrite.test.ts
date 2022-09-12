import { Mutex } from "./mutex";
import { describe, it, expect } from "vitest";
import { RWMutex, LockTypes } from "./readwrite";
import * as fc from "fast-check";

const withRead = async (lock: RWMutex<[]>, cb: () => Promise<void>) => {
  const release = await lock.acquire(LockTypes.READ);
  try {
    await cb();
  } finally {
    release();
  }
};

const withWrite = async (lock: RWMutex<[]>, cb: () => Promise<void>) => {
  const release = await lock.acquire(LockTypes.WRITE);
  try {
    await cb();
  } finally {
    release();
  }
};

const newMutex = () => new RWMutex(() => new Mutex());

describe("Base RW Lock", () => {
  const arbitraryLockType = fc.oneof(
    fc.constant(LockTypes.READ),
    fc.constant(LockTypes.WRITE)
  );

  it("Maintains order", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbitraryLockType, { minLength: 2, maxLength: 20 }),
        async (locks: LockTypes[]) => {
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
              type === LockTypes.READ
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

  const asyncNOP = async () => new Promise<void>((resolve) => resolve());

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
              type === LockTypes.READ
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
      const r = await lock.acquire(LockTypes.WRITE);
      data.push("write");
      r();
    };

    // acquire 2 readers, but release 1 of them twice. Before releasing the second reader, try to acquire a writer.
    // The writer should finish last
    const release1 = await lock.acquire(LockTypes.READ);
    const release2Promise = lock.acquire(LockTypes.READ);
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
