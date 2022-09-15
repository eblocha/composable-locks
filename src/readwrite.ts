import type { ILock, Releaser } from "./interfaces";
import { Domain, ReentrantMutex } from "./reentrant";

export type RWLockType = "read" | "write";

export class RWMutex<A extends unknown[]>
  extends ReentrantMutex<A>
  implements ILock<[RWLockType, ...A]>
{
  protected readerDomain = new Domain();

  constructor(newLock: () => ILock<A>, preferRead = false) {
    super(newLock, preferRead);
  }

  public acquire(type: RWLockType, ...args: A): Promise<Releaser> {
    switch (type) {
      case "read":
        return super.acquire(this.readerDomain, ...args);
      case "write":
        return super.acquire(new Domain(), ...args);
    }
  }
}
