import type { ILock, Releaser } from "./interfaces";
import { Domain, ReentrantMutex } from "./reentrant";

export enum LockTypes {
  READ = "read",
  WRITE = "write",
}

export class RWMutex<A extends unknown[]>
  extends ReentrantMutex<A>
  implements ILock<[LockTypes, ...A]>
{
  protected readerDomain = new Domain();

  public async acquire(type: LockTypes, ...args: A): Promise<Releaser> {
    switch (type) {
      case LockTypes.READ:
        return super.acquire(this.readerDomain, ...args);
      case LockTypes.WRITE:
        return super.acquire(new Domain(), ...args);
    }
  }

  public async waitForUnlock(type: LockTypes, ...args: A): Promise<void> {
    switch (type) {
      case LockTypes.READ:
        return super.waitForUnlock(this.readerDomain, ...args);
      case LockTypes.WRITE:
        return super.waitForUnlock(new Domain(), ...args);
    }
  }
}
