import type { ILock, Releaser } from "./interfaces";
import { ReentrantMutex } from "./reentrant";

export type RWLockType = "read" | "write";

export class RWMutex<A extends unknown[]> implements ILock<[RWLockType, ...A]> {
  protected readerDomain = Symbol();
  protected base: ReentrantMutex<A>;

  constructor(newLock: () => ILock<A>, preferRead = false) {
    this.base = new ReentrantMutex(newLock, preferRead);
  }

  public acquire(type: RWLockType, ...args: A): Promise<Releaser> {
    switch (type) {
      case "read":
        return this.base.acquire(this.readerDomain, ...args);
      case "write":
        return this.base.acquire(Symbol(), ...args);
    }
  }
}
