import { ILock, Releaser } from "./interfaces";
import { asyncNOP } from "./utils";

// exported for use in function signatures
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IDomain {}

// do not export
class Domain implements IDomain {}

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
  implements ILock<[IDomain, ...A]>
{
  /** The current domain that does not have to wait to acquire */
  protected holder: IDomain | null = null;
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
  public async acquire(id: IDomain, ...args: A) {
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
    return () => {
      // When releasing, decrement the re-entrants.
      this.reentrants--;
      if (this.reentrants === 0) {
        // if we are the last one, release the mutex.
        this.holder = null;
        this.releaser();
      }
    };
  }

  public async waitForUnlock(id: IDomain, ...args: A): Promise<void> {
    if (!this.holder || id === this.holder) {
      await asyncNOP();
    } else {
      await this.lock.waitForUnlock(...args);
    }
  }

  /**
   * Run a callback inside a locking domain.
   * The mutex can be re-acuired with the domain identifier passed to the provded callback.
   * @param cb The function to run inside the domain
   * @returns The return value of the function
   */
  public domain<T>(cb: (id: IDomain) => T): T {
    // create a new locking domain
    return cb(new Domain());
  }
}
