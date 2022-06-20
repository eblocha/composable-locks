import type { Mutex } from "async-mutex";
import { ILock } from "./interfaces";

export type Resolver<K extends string | number | symbol = string> = (
  key: K
) => K;

type LockRecord<T> = {
  count: number;
  lock: T;
};

/**
 * A keyed lock, for mapping strings to a lock type
 */
export class KeyedMutex<
  TKey extends string | number | symbol = string,
  TArgs extends any[] = [],
  TLock extends ILock<TArgs> = Mutex
> implements ILock<[TKey, ...TArgs]>
{
  protected locks: Record<TKey, LockRecord<TLock>> = {} as Record<
    TKey,
    LockRecord<TLock>
  >;
  resolver: Resolver<TKey>;
  newLock: () => TLock;

  /**
   * A keyed lock, for mapping strings to a lock type
   * @param newLock A function to create a new lock interface
   * @param resolver A function to transform a key into a normaized form.
   * Useful for resolving paths.
   */
  constructor(newLock: () => TLock, resolver?: Resolver<TKey>) {
    this.resolver = resolver ?? ((key) => key);
    this.newLock = newLock;
  }

  private getOrCreateLock(key: TKey): LockRecord<TLock> {
    let record = this.locks[key];
    if (record) return record;

    const newRecord: LockRecord<TLock> = {
      count: 0,
      lock: this.newLock(),
    };
    this.locks[key] = newRecord;
    return newRecord;
  }

  public async withLock<T>(
    key: TKey,
    f: () => T | Promise<T>,
    ...args: TArgs
  ): Promise<T> {
    const release = await this.acquire(this.resolver(key), ...args);
    try {
      return await f();
    } finally {
      release();
    }
  }

  public async acquire(key: TKey, ...args: TArgs) {
    const resolved = this.resolver(key);
    const record = this.getOrCreateLock(resolved);

    record.count++;

    const release = await record.lock.acquire(...args);

    return () => {
      release();
      record.count--;
      if (record.count === 0) {
        delete this.locks[resolved];
      }
    };
  }

  public async waitForUnlock(key: TKey, ...args: TArgs): Promise<void> {
    const resolved = this.resolver(key);
    const record = this.locks[resolved];
    if (record) {
      return await record.lock.waitForUnlock(...args);
    }
  }
}
