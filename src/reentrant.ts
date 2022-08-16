import { ILock, Releaser } from "./interfaces";
import { asyncNOP } from "./utils";

/** Class used for domain identity (referential equality) */
export class Domain {}

/**
 * A re-entrant Mutex.
 *
 * Usage:
 * ```
 * const lock = new ReentrantMutex()
 *
 * lock.domain(async (id) => {
 *   const release = await lock.acquire(id)
 *   try {
 *     const release = await lock.acquire(id)
 *     release()
 *   } finally {
 *     release()
 *   }
 * })
 * ```
 */
export class ReentrantMutex<A extends unknown[]>
  implements ILock<[Domain, ...A]>
{
  /** The current domain that does not have to wait to acquire */
  protected holder: Domain | null = null;
  /** The number of times the current domain has acquired the lock */
  protected reentrants = 0;
  /** The lock */
  protected lock: ILock<A>;
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  protected releaser: Releaser = () => {};

  constructor(newLock: () => ILock<A>) {
    this.lock = newLock();
  }

  /**
   * Acquire the lock
   * @param id The domain identifier, provided by the `domain` method.
   * @returns A function to release the lock. A domain *must* call all releasers before exiting.
   */
  public async acquire(id: Domain, ...args: A) {
    if (this.holder === null) {
      // if holder is null, we acquire right away.
      this.holder = id;
      this.releaser = await this.lock.acquire(...args);
    } else if (id === this.holder) {
      // wait one tick to take the same number of ticks as actually acquiring
      await asyncNOP();
    } else {
      // wait until the current domain releases.
      this.releaser = await this.lock.acquire(...args);
      // once acquired, set ourselves to the current holder
      this.holder = id;
    }

    // if we are here, we are the current domain. Increment re-entrants.
    this.reentrants++;

    // ensure idempotence
    let released = false;

    return () => {
      if (released) return;
      // When releasing, decrement the re-entrants.
      this.reentrants--;
      if (this.reentrants === 0) {
        // if we are the last one, release the mutex.
        this.holder = null;
        this.releaser();
      }
      released = true;
    };
  }

  public async waitForUnlock(id: Domain, ...args: A): Promise<void> {
    if (!this.holder || id === this.holder) {
      await asyncNOP();
    } else {
      await this.lock.waitForUnlock(...args);
    }
  }
}
