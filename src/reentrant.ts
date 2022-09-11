import type { ILock, Releaser } from "./interfaces";
import { asyncNOP } from "./utils";

/** Class used for domain identity (referential equality) */
export class Domain {}

type Queued<T = unknown> = {
  id: T;
  reentrants: number;
  releaser: Promise<Releaser>;
};

/**
 * A re-entrant Mutex.
 *
 * Usage:
 * ```
 * const lock = new ReentrantMutex()
 * const domain = new Domain()
 *
 * const release1 = await lock.acquire(domain)
 * const release2 = await lock.acquire(domain)
 * release1()
 * release2()
 * ```
 */
export class ReentrantMutex<A extends unknown[]>
  implements ILock<[unknown, ...A]>
{
  protected latest: Queued | null = null;
  protected lock: ILock<A>;
  protected chain = Promise.resolve();

  constructor(newLock: () => ILock<A>) {
    this.lock = newLock();
  }

  /**
   * Acquire the lock
   * @param id The domain identifier.
   * @returns A function to release the lock. A domain *must* call all releasers before exiting.
   */
  public async acquire(id: unknown, ...args: A) {
    let queued: Queued;

    if (!this.latest || this.latest.id !== id) {
      queued = { id, reentrants: 1, releaser: this.lock.acquire(...args) };
      this.latest = queued;
    } else {
      queued = this.latest;
      queued.reentrants++;
      await asyncNOP();
    }

    const releaser = await queued.releaser;

    let released = false;
    return () => {
      if (released) return;
      released = true;
      queued.reentrants--;
      if (queued.reentrants === 0) {
        if (this.latest === queued) {
          this.latest = null;
        }
        releaser();
      }
    };
  }

  public async waitForUnlock(id: unknown, ...args: A): Promise<void> {
    (await this.acquire(id, ...args))();
  }
}
