import type { ILock, Releaser } from "./interfaces";

// inspired from https://github.com/mgtitimoli/await-mutex, with some tweaks for typescript
export class Mutex implements ILock<[]> {
  protected _locking = Promise.resolve();

  acquire(): Promise<Releaser> {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    let unlockNext = () => {};
    const willLock = new Promise<void>((resolve) => {
      unlockNext = () => resolve();
    });

    const willUnlock = this._locking.then(() => unlockNext);
    this._locking = this._locking.then(() => willLock);

    return willUnlock;
  }

  waitForUnlock(): Promise<void> {
    return this._locking;
  }
}
