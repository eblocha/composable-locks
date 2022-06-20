import { Mutex } from "async-mutex";
import { ILock, Releaser } from "./interfaces";

/** Forces a function to pause and move itself to the back of the event loop */
const asyncNOP = async () => new Promise<void>((resolve) => resolve());

export enum LockTypes {
  READ = "read",
  WRITE = "write",
}

/**
 * Single threaded write-preferring read write lock
 * See: https://gist.github.com/CMCDragonkai/4de5c1526fc58dac259e321db8cf5331
 */
export class RWMutex<A extends unknown[]> implements ILock<[LockTypes, ...A]> {
  protected readersLock: ILock<A>;
  protected writersLock: ILock<A>;
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  protected readersRelease: Releaser = () => {};
  protected readerCountBlocked = 0;
  protected _readerCount = 0;
  protected _writerCount = 0;

  constructor(newLock: () => ILock<A>) {
    this.readersLock = newLock();
    this.writersLock = newLock();
  }

  public get readerCount(): number {
    return this._readerCount + this.readerCountBlocked;
  }

  public get writerCount(): number {
    return this._writerCount;
  }

  public async acquire(type: LockTypes, ...args: A): Promise<Releaser> {
    switch (type) {
      case LockTypes.READ:
        return this.acquireRead(...args);
      case LockTypes.WRITE:
        return this.acquireWrite(...args);
    }
  }

  public async waitForUnlock(type: LockTypes, ...args: A): Promise<void> {
    const waitForWriters = async () => {
      const writerCount = this._writerCount;
      for (let i = 0; i < writerCount; i++) {
        await this.writersLock.waitForUnlock(...args);
      }
    };

    switch (type) {
      case LockTypes.READ:
        await this.readersLock.waitForUnlock(...args);
      case LockTypes.WRITE:
        // writers need both readers and writers unlocked
        await Promise.all([
          this.readersLock.waitForUnlock(...args),
          waitForWriters(),
        ]);
    }
  }

  public async acquireRead(...args: A): Promise<() => void> {
    if (this._writerCount > 0) {
      ++this.readerCountBlocked;
      const writerCount = this._writerCount;
      // Wait for every writer that came before us to unlock, not just the first
      for (let i = 0; i < writerCount; i++) {
        await this.writersLock.waitForUnlock(...args);
      }
      --this.readerCountBlocked;
    }
    const readerCount = ++this._readerCount;
    // The first reader locks
    if (readerCount === 1) {
      this.readersRelease = await this.readersLock.acquire(...args);
    } else {
      // To ensure we use the same number of event loop ticks
      // whether we need to acquire the lock or not
      await asyncNOP();
    }
    return () => {
      const readerCount = --this._readerCount;
      // The last reader unlocks
      if (readerCount === 0) {
        this.readersRelease();
      }
    };
  }

  public async acquireWrite(...args: A): Promise<() => void> {
    ++this._writerCount;
    const writersRelease = await this.writersLock.acquire(...args);

    if (this._readerCount) {
      await this.readersLock.waitForUnlock(...args);
    }

    return () => {
      writersRelease();
      --this._writerCount;
    };
  }
}
