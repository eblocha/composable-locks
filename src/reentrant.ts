import type { ILock, Releaser } from "./interfaces";

type Queued = {
  id: symbol;
  reentrants: number;
  releaser: Promise<Releaser>;
};

/**
 * A re-entrant Mutex.
 *
 * Usage:
 * ```
 * const lock = new ReentrantMutex(() => new Mutex())
 * const domain = Symbol()
 *
 * const release1 = await lock.acquire(domain)
 * const release2 = await lock.acquire(domain)
 * release1()
 * release2()
 * ```
 */
export class ReentrantMutex<A extends unknown[]>
  implements ILock<[symbol, ...A]>
{
  protected latest: Queued | null = null;
  protected lockMap: Record<symbol, Queued> = {};
  protected lock: ILock<A>;

  constructor(newLock: () => ILock<A>, private readonly greedy = true) {
    this.lock = newLock();
  }

  /**
   * Acquire the lock
   * @param id The domain identifier.
   * @returns A function to release the lock. A domain *must* call all releasers before exiting.
   */
  public async acquire(id: symbol, ...args: A) {
    const queued = this.getQueued(id, ...args);

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
  private getQueued(id: symbol, ...args: A): Queued {
    if (this.greedy) {
      return this.getQueuedGreedy(id, ...args);
    } else {
      return this.getQueuedUngreedy(id, ...args);
    }
  }

  private getQueuedGreedy(id: symbol, ...args: A): Queued {
    const existing = this.lockMap[id];
    if (existing) {
      return existing;
    } else {
      const queued = this.createQueued(id, ...args);
      this.lockMap[id] = queued;
      return queued;
    }
  }

  private getQueuedUngreedy(id: symbol, ...args: A): Queued {
    if (!this.latest || this.latest.id !== id) {
      const queued = this.createQueued(id, ...args);
      this.latest = queued;
      return queued;
    } else {
      const queued = this.latest;
      queued.reentrants++;
      return queued;
    }
  }

  private createQueued(id: symbol, ...args: A): Queued {
    return {
      id,
      reentrants: 1,
      releaser: this.lock.acquire(...args),
    };
  }

  private cleanup(queued: Queued) {
    if (this.greedy) {
      delete this.lockMap[queued.id];
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
