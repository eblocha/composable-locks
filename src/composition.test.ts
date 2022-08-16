import { Mutex } from "async-mutex";
import { describe, it, expect } from "vitest";
import { KeyedMutex } from "./keyed";
import { LockTypes, RWMutex } from "./readwrite";
import { Domain, ReentrantMutex } from "./reentrant";
import { asyncNOP, withPermissions } from "./utils";

describe("Lock composition", () => {
  it("allows concurrent writers in the same re-entrant domain", async () => {
    const lock = new ReentrantMutex(
      () => new KeyedMutex(() => new RWMutex(() => new Mutex()))
    );

    const data: number[] = [];

    const delayTicks: number[] = [5, 2];

    const fn = async (
      id: Domain,
      key: string,
      type: LockTypes,
      ticks: number
    ) => {
      await withPermissions([lock.acquire(id, key, type)], async () => {
        for (let i = 0; i < ticks; i++) {
          await asyncNOP();
        }
        data.push(ticks);
      });
    };

    const id = new Domain();

    await Promise.all(
      delayTicks.map((ticks) => fn(id, "file", LockTypes.WRITE, ticks))
    );

    expect(data).toStrictEqual([2, 5]);
  });
});
