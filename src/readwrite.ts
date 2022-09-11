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
}
