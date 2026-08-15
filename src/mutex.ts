import type { ILock, Releaser } from "./interfaces.ts";

// inspired from https://github.com/mgtitimoli/await-mutex, with some tweaks for typescript
export class Mutex implements ILock<[]> {
  protected locking = Promise.resolve();

  public acquire(): Promise<Releaser> {
    let unlockNext: Releaser;
    const willLock = new Promise<void>((resolve) => {
      unlockNext = resolve;
    });

    const willUnlock = this.locking.then(() => unlockNext);
    this.locking = this.locking.then(() => willLock);

    return willUnlock;
  }
}
