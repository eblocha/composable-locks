import { Mutex } from "./mutex";
import { describe, it, expect } from "vitest";
import { ReentrantMutex } from "./reentrant";
import { asyncNOP } from "./test-utils";

describe("Reentrant Mutex", () => {
  it("Only allows one domain to acquire", async () => {
    const lock = new ReentrantMutex(() => new Mutex());

    const data: string[] = [];

    const delayTicks: number[] = [20, 2];

    const fn = async (ticks: number) => {
      const id = Symbol();
      data.push(`try ${ticks}`);
      const release = await lock.acquire(id);
      data.push(`start ${ticks}`);
      for (let i = 0; i < ticks; i++) {
        await asyncNOP();
      }
      data.push(`finish ${ticks}`);
      release();
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

    const fn = async (id: symbol, ticks: number) => {
      data.push(`try ${ticks}`);
      const release = await lock.acquire(id);
      data.push(`start ${ticks}`);
      for (let i = 0; i < ticks; i++) {
        await asyncNOP();
      }
      data.push(`finish ${ticks}`);
      release();
    };

    const id = Symbol();

    await Promise.all(delayTicks.map((ticks) => fn(id, ticks)));

    expect(data).toStrictEqual([
      "try 20",
      "try 2",
      "start 20",
      "start 2",
      "finish 2",
      "finish 20",
    ]);
  });

  it("allows a domain to skip the line if greedy", async () => {
    const lock = new ReentrantMutex(() => new Mutex());
    const d1 = Symbol("d1");
    const d2 = Symbol("d2");
    const data: string[] = [];

    const f1 = async () => {
      const r1 = await lock.acquire(d1);
      data.push("d1-1");
      for (let i = 0; i < 5; i++) {
        await asyncNOP();
      }
      const r2 = await lock.acquire(d1);
      for (let i = 0; i < 5; i++) {
        await asyncNOP();
      }
      data.push("d1-2");
      r1();
      r2();
    };

    const f2 = async () => {
      const r = await lock.acquire(d2);
      for (let i = 0; i < 5; i++) {
        await asyncNOP();
      }
      data.push("d2-1");
      r();
    };

    await Promise.all([f1(), f2()]);

    expect(data).toStrictEqual(["d1-1", "d1-2", "d2-1"]);
  });

  it("release function is idempotent", async () => {
    const lock = new ReentrantMutex(() => new Mutex());

    const data: string[] = [];

    const id1 = Symbol();
    const id2 = Symbol();

    // create 2 domains, and re-acquire lock in the first. Call the release function for the first aqcuisition twice.
    const release1 = await lock.acquire(id1);
    const release2 = await lock.acquire(id1);
    data.push("d1-1");

    release1();
    release1();

    // this second domain should be deferred until the release2 function is called
    const p = (async () => {
      const r = await lock.acquire(id2);
      data.push("d2-1");
      r();
    })();

    await Promise.all([
      (async () => {
        await asyncNOP();
        data.push("d1-2");
        release2();
      })(),
      p,
    ]);

    expect(data).toStrictEqual(["d1-1", "d1-2", "d2-1"]);
  });
});
