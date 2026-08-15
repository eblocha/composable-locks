import { describe, it, expect } from "vitest";

import { KeyedMutex } from "./keyed.ts";
import { Mutex } from "./mutex.ts";
import { RWLockType, RWMutex } from "./readwrite.ts";
import { ReentrantMutex } from "./reentrant.ts";
import { asyncNOP } from "./test-utils.ts";
import { withPermissions } from "./utils.ts";

describe("Lock composition", () => {
  it("allows concurrent writers in the same re-entrant domain", async () => {
    const lock = new ReentrantMutex(() => new KeyedMutex(() => new RWMutex(() => new Mutex())));

    const data: number[] = [];

    const delayTicks: number[] = [5, 2];

    const fn = async (id: symbol, key: string, type: RWLockType, ticks: number) => {
      await withPermissions([lock.acquire(id, key, type)], async () => {
        for (let i = 0; i < ticks; i++) {
          await asyncNOP();
        }
        data.push(ticks);
      });
    };

    const id = Symbol();

    await Promise.all(delayTicks.map((ticks) => fn(id, "file", "write", ticks)));

    expect(data).toStrictEqual([2, 5]);
  });
});
