import { describe, it, expect } from "vitest";
import { Mutex } from "./mutex";
import { KeyedMutex } from "./keyed";
import { RWLockType, RWMutex } from "./readwrite";
import { Domain, ReentrantMutex } from "./reentrant";
import { withPermissions } from "./utils";
import { asyncNOP } from "./test-utils";

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
      type: RWLockType,
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
      delayTicks.map((ticks) => fn(id, "file", "write", ticks))
    );

    expect(data).toStrictEqual([2, 5]);
  });
});
