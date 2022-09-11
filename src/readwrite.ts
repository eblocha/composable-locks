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
        return this.acquireRead(...args);
      case LockTypes.WRITE:
        return this.acquireWrite(...args);
    }
  }

  public async waitForUnlock(type: LockTypes, ...args: A): Promise<void> {
    switch (type) {
      case LockTypes.READ:
        await super.waitForUnlock(this.readerDomain, ...args);
        break;
      case LockTypes.WRITE:
        await super.waitForUnlock(new Domain(), ...args);
    }
  }

  private async acquireRead(...args: A): Promise<() => void> {
    return super.acquire(this.readerDomain, ...args);
  }

  private async acquireWrite(...args: A): Promise<() => void> {
    return super.acquire(new Domain(), ...args);
  }
}
