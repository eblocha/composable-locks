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
      withWrite(lock, async () => {
        data.push("data2");
      }),
    ]);

    expect(data).toStrictEqual(["data1", "data2"]);
  });
});
