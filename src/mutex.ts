import type { ILock, Releaser } from "./interfaces";

// inspired from https://github.com/mgtitimoli/await-mutex, with some tweaks for typescript
export class Mutex implements ILock<[]> {
  protected _locking = Promise.resolve();

  acquire(): Promise<Releaser> {
    let unlockNext: Releaser;
    const willLock = new Promise<void>((resolve) => {
      unlockNext = () => resolve();
    });

    const willUnlock = this._locking.then(() => unlockNext);
    this._locking = this._locking.then(() => willLock);

    return willUnlock;
  }
}
