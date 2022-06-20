import { Mutex } from "async-mutex";
import { describe, it, expect } from "vitest";
import { KeyedMutex } from "./keyed";
import { asyncNOP, withPermissions } from "./utils";

describe("Keyed lock", () => {
  it("allows different keys to lock independently", async () => {
    const lock = new KeyedMutex(() => new Mutex());
    const data: number[] = [];
    const delayTicks: number[] = [5, 2];
    const keys: string[] = ["a", "b"];

    const fn = async (ticks: number, key: string) => {
      await withPermissions([lock.acquire(key)], async () => {
        for (let i = 0; i < ticks; i++) {
          await asyncNOP();
        }
        data.push(ticks);
      });
    };

    const expected = [2, 5];

    await Promise.all(delayTicks.map((ticks, index) => fn(ticks, keys[index])));
    expect(data).toStrictEqual(expected);
  });

  it("maintains exclusivity with different keys", async () => {
    const lock = new KeyedMutex(() => new Mutex());
    const data: number[] = [];
    const delayTicks: number[] = [5, 2];
    const keys: string[] = ["a", "a"];

    const fn = async (ticks: number, key: string) => {
      await withPermissions([lock.acquire(key)], async () => {
        for (let i = 0; i < ticks; i++) {
          await asyncNOP();
        }
        data.push(ticks);
      });
    };

    const expected = [5, 2];

    await Promise.all(delayTicks.map((ticks, index) => fn(ticks, keys[index])));
    expect(data).toStrictEqual(expected);
  });

  it("uses the resolve function to resolve keys", async () => {
    const lock = new KeyedMutex(
      () => new Mutex(),
      () => "a" as string // we always resolve to "a", but give different keys. Should be exclusive.
    );
    const data: number[] = [];
    const delayTicks: number[] = [5, 2];
    const keys: string[] = ["a", "b"];

    const fn = async (ticks: number, key: string) => {
      await withPermissions([lock.acquire(key)], async () => {
        for (let i = 0; i < ticks; i++) {
          await asyncNOP();
        }
        data.push(ticks);
      });
    };

    const expected = [5, 2];

    await Promise.all(delayTicks.map((ticks, index) => fn(ticks, keys[index])));
    expect(data).toStrictEqual(expected);
  });
});
