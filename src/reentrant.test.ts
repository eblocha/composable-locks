import { Mutex } from "async-mutex";
import { describe, it, expect } from "vitest";
import { ReentrantMutex } from "./reentrant";
import { asyncNOP, withPermissions } from "./utils";

describe("Reentrant Mutex", () => {
  it("Only allows one domain to acquire", async () => {
    const lock = new ReentrantMutex(() => new Mutex());

    const data: number[] = [];

    const delayTicks: number[] = [5, 2];

    const fn = async (ticks: number) => {
      await lock.domain(async (id) => {
        await withPermissions([lock.acquire(id)], async () => {
          for (let i = 0; i < ticks; i++) {
            await asyncNOP();
          }
          data.push(ticks);
        });
      });
    };

    await Promise.all(delayTicks.map(fn));

    expect(data).toStrictEqual(delayTicks);
  });

  it("allows re-entrancy", async () => {
    const lock = new ReentrantMutex(() => new Mutex());
    await lock.domain(async (id) => {
      const release = await lock.acquire(id);
      const release2 = await lock.acquire(id);
      release2();
      release();
    });
  });
});
