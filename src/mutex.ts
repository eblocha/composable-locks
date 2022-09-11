import type { ILock, Releaser } from "./interfaces";

export class Mutex implements ILock<[]> {
  private _locking = Promise.resolve();

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

  async waitForUnlock(): Promise<void> {
    await this._locking;
  }
}
