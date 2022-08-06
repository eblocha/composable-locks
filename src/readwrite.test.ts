import { Mutex } from "async-mutex";
import { describe, it, expect } from "vitest";
import { RWMutex, LockTypes } from "./readwrite";

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
  type TestCase = {
    locks: LockTypes[];
  };

  const tests: TestCase[] = [
    { locks: [LockTypes.READ, LockTypes.WRITE, LockTypes.READ] },
    { locks: [LockTypes.WRITE, LockTypes.READ] },
    { locks: [LockTypes.READ, LockTypes.WRITE] },
    {
      locks: [
        LockTypes.READ,
        LockTypes.READ,
        LockTypes.WRITE,
        LockTypes.READ,
        LockTypes.READ,
        LockTypes.WRITE,
        LockTypes.READ,
      ],
    },
    {
      locks: [
        LockTypes.READ,
        LockTypes.READ,
        LockTypes.WRITE,
        LockTypes.READ,
        LockTypes.READ,
        LockTypes.READ,
        LockTypes.READ,
        LockTypes.WRITE,
        LockTypes.READ,
        LockTypes.WRITE,
        LockTypes.WRITE,
        LockTypes.READ,
      ],
    },
  ];

  it.each(tests)("Maintains order: $locks", async ({ locks }) => {
    const lock = newMutex();
    const data: string[] = [];

    const expected = locks.map((type, index) => type + index.toString());

    // eslint-disable-next-line @typescript-eslint/require-await
    const fn = async (index: number) => {
      const e = expected[index];
      if (e) data.push(e);
    };
    await Promise.all(
      locks.map((type, index) =>
        type === LockTypes.READ
          ? withRead(lock, () => fn(index))
          : withWrite(lock, () => fn(index))
      )
    );
    expect(data).toStrictEqual(expected);
  });

  const asyncNOP = async () => new Promise<void>((resolve) => resolve());

  it("Maintains order with uneven event loop ticks", async () => {
    const lock = newMutex();

    const data: string[] = [];

    const locks = [
      LockTypes.READ,
      LockTypes.READ,
      LockTypes.WRITE,
      LockTypes.READ,
      LockTypes.READ,
      LockTypes.WRITE,
      LockTypes.READ,
    ];

    const expected = locks.map((type, index) => type + index.toString());

    const ticks = [5, 2, 7, 10, 2, 0, 1];

    const fn = async (index: number) => {
      const e = expected[index];
      if (e) data.push(e);
      const t = ticks[index] ?? 0;
      for (let i = 0; i < t; i++) {
        await asyncNOP();
      }
    };

    await Promise.all(
      locks.map((type, index) =>
        type === LockTypes.READ
          ? withRead(lock, () => fn(index))
          : withWrite(lock, () => fn(index))
      )
    );
    expect(data).toStrictEqual(expected);
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
