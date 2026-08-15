import type { ILock, Releaser } from "./interfaces.ts";
import { ReentrantMutex } from "./reentrant.ts";

export type RWLockType = "read" | "write";

export class RWMutex<A extends unknown[]> implements ILock<[RWLockType, ...A]> {
  protected readerDomain: symbol = Symbol();
  protected base: ReentrantMutex<A>;

  public constructor(newLock: () => ILock<A>, preferRead = false) {
    this.base = new ReentrantMutex(newLock, preferRead);
  }

  // oxlint-disable-next-line typescript/consistent-return -- switch is exhaustive
  public acquire(type: RWLockType, ...args: A): Promise<Releaser> {
    switch (type) {
      case "read":
        return this.base.acquire(this.readerDomain, ...args);
      case "write":
        return this.base.acquire(Symbol(), ...args);
    }
  }
}
