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
  // only Maps allow for objects as keys
  protected lockMap: Map<unknown, Queued> = new Map();
  protected lock: ILock<A>;

  constructor(newLock: () => ILock<A>, private greedy = true) {
    this.lock = newLock();
  }

  /**
   * Acquire the lock
   * @param id The domain identifier.
   * @returns A function to release the lock. A domain *must* call all releasers before exiting.
   */
  public async acquire(id: unknown, ...args: A) {
    const [queued, existed] = this.getQueued(id, ...args);
    if (existed) {
      await asyncNOP();
    }

    const releaser = await queued.releaser;

    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.release(queued, releaser);
    };
  }

  /**
   * Get a queued domain object
   * @param id The domain to get the queued information for
   * @param args Passed to the underlying mutex
   * @returns The queued information, and a boolean that is true if the domain existed.
   */
  private getQueued(id: unknown, ...args: A): [Queued, boolean] {
    if (this.greedy) {
      return this.getQueuedGreedy(id, ...args);
    } else {
      return this.getQueuedUngreedy(id, ...args);
    }
  }

  private getQueuedGreedy(id: unknown, ...args: A): [Queued, boolean] {
    const existing = this.lockMap.get(id);
    if (existing) {
      return [existing, true];
    } else {
      const queued = this.createQueued(id, ...args);
      this.lockMap.set(id, queued);
      return [queued, false];
    }
  }

  private getQueuedUngreedy(id: unknown, ...args: A): [Queued, boolean] {
    if (!this.latest || this.latest.id !== id) {
      const queued = this.createQueued(id, ...args);
      this.latest = queued;
      return [queued, false];
    } else {
      const queued = this.latest;
      queued.reentrants++;
      return [queued, true];
    }
  }

  private createQueued(id: unknown, ...args: A) {
    return {
      id,
      reentrants: 1,
      releaser: this.lock.acquire(...args),
    };
  }

  private cleanup(queued: Queued) {
    if (this.greedy) {
      this.lockMap.delete(queued.id);
    } else if (this.latest === queued) {
      this.latest = null;
    }
  }

  private release(queued: Queued, releaser: Releaser) {
    queued.reentrants--;
    if (queued.reentrants === 0) {
      this.cleanup(queued);
      releaser();
    }
  }
}
