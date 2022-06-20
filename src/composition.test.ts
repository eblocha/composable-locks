import { Mutex } from "async-mutex";
import { describe, it, expect } from "vitest";
import { KeyedMutex } from "./keyed";
import { LockTypes, RWMutex } from "./readwrite";
import { ReentrantMutex } from "./reentrant";

describe("Lock composition", () => {
  it("composes locks together", async () => {
    const lock = new ReentrantMutex(
      () => new KeyedMutex(() => new RWMutex(() => new Mutex()))
    );

    await lock.domain(async (id) => {
      const release = await lock.acquire(id, "fileA", LockTypes.READ);
      release();
    });
  });
});
