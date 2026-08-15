import { describe, expect, it } from "vitest";

import { Mutex } from "./mutex.ts";
import { asyncNOP } from "./test-utils.ts";
import { withPermissions } from "./utils.ts";

describe("Mutex", () => {
  it(
    "can aquire and release the mutex",
    // failure when it deadlocks
    {
      timeout: 100,
    },
    async () => {
      const lock = new Mutex();
      const releaser = await lock.acquire();
      releaser();
    },
  );

  it("locks a resource", async () => {
    const lock = new Mutex();
    const data: number[] = [];
    const delayTicks: number[] = [5, 2, 8, 7];

    const fn = async (ticks: number) => {
      await withPermissions([lock.acquire()], async () => {
        for (let i = 0; i < ticks; i++) {
          await asyncNOP();
        }
        data.push(ticks);
      });
    };

    await Promise.all(delayTicks.map((ticks) => fn(ticks)));
    expect(data).toStrictEqual(delayTicks);
  });

  it("releaser is idempotent", async () => {
    const lock = new Mutex();
    const data: number[] = [];
    const delayTicks: number[] = [5, 2, 8, 7];

    const fn = async (ticks: number) => {
      const releaser = await lock.acquire();
      for (let i = 0; i < ticks; i++) {
        await asyncNOP();
      }
      data.push(ticks);
      releaser();
      releaser();
    };

    await Promise.all(delayTicks.map((ticks) => fn(ticks)));
    expect(data).toStrictEqual(delayTicks);
  });
});
