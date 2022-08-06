import { Mutex } from "async-mutex";
import { describe, it, expect } from "vitest";
import { IDomain, ReentrantMutex } from "./reentrant";
import { asyncNOP } from "./utils";

describe("Reentrant Mutex", () => {
  it("Only allows one domain to acquire", async () => {
    const lock = new ReentrantMutex(() => new Mutex());

    const data: string[] = [];

    const delayTicks: number[] = [20, 2];

    const fn = async (ticks: number) => {
      await lock.domain(async (id) => {
        data.push(`try ${ticks}`);
        const release = await lock.acquire(id);
        data.push(`start ${ticks}`);
        for (let i = 0; i < ticks; i++) {
          await asyncNOP();
        }
        data.push(`finish ${ticks}`);
        release();
      });
    };

    await Promise.all(delayTicks.map(fn));

    expect(data).toStrictEqual([
      "try 20",
      "try 2",
      "start 20",
      "finish 20",
      "start 2",
      "finish 2",
    ]);
  });

  it("allows re-entrancy", async () => {
    const lock = new ReentrantMutex(() => new Mutex());

    const data: string[] = [];

    const delayTicks: number[] = [20, 2];

    const fn = async (id: IDomain, ticks: number) => {
      data.push(`try ${ticks}`);
      const release = await lock.acquire(id);
      data.push(`start ${ticks}`);
      for (let i = 0; i < ticks; i++) {
        await asyncNOP();
      }
      data.push(`finish ${ticks}`);
      release();
    };

    await lock.domain(async (id) => {
      await Promise.all(delayTicks.map((ticks) => fn(id, ticks)));
    });

    expect(data).toStrictEqual([
      "try 20",
      "try 2",
      "start 20",
      "start 2",
      "finish 2",
      "finish 20",
    ]);
  });

  it("release function is idempotent", async () => {
    const lock = new ReentrantMutex(() => new Mutex());

    const data: string[] = [];

    // create 2 domains, and re-acquire lock in the first. Call the release function for the first aqcuisition twice.
    await lock.domain(async (id) => {
      const release1 = await lock.acquire(id);
      const release2 = await lock.acquire(id);
      data.push("d1-1");

      release1();
      release1();

      // this second domain should be deferred until the release2 function is called
      const p = lock.domain(async (id) => {
        const r = await lock.acquire(id);
        data.push("d2-1");
        r();
      });

      await Promise.all([
        (async () => {
          await asyncNOP();
          data.push("d1-2");
          release2();
        })(),
        p,
      ]);
    });

    expect(data).toStrictEqual(["d1-1", "d1-2", "d2-1"]);
  });
});
