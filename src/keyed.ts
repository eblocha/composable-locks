import type { ILock, Releaser } from "./interfaces";

export type Resolver<K> = (key: K) => K;

type LockRecord<T> = {
  count: number;
  lock: T;
};

/**
 * A keyed lock, for mapping strings to a lock type
 */
export class KeyedMutex<
  TArgs extends unknown[],
  TKey extends string | number | symbol
> implements ILock<[TKey, ...TArgs]>
{
  protected locks: Record<TKey, LockRecord<ILock<TArgs>>> = {} as Record<
    TKey,
    LockRecord<ILock<TArgs>>
  >;
  protected resolver: Resolver<TKey>;

  /**
   * A keyed lock, for mapping strings to a lock type
   * @param newLock A function to create a new lock interface
   * @param resolver A function to transform a key into a normalized form.
   * Useful for resolving paths.
   */
  constructor(
    protected newLock: () => ILock<TArgs>,
    resolver?: Resolver<TKey>
  ) {
    this.resolver = resolver ?? ((key) => key);
  }

  private getOrCreateLock(key: TKey): LockRecord<ILock<TArgs>> {
    const record = this.locks[key];
    if (record) return record;

    const newRecord: LockRecord<ILock<TArgs>> = {
      count: 0,
      lock: this.newLock(),
    };
    this.locks[key] = newRecord;
    return newRecord;
  }

  public async acquire(key: TKey, ...args: TArgs): Promise<Releaser> {
    const resolved = this.resolver(key);
    const record = this.getOrCreateLock(resolved);

    record.count++;

    const release = await record.lock.acquire(...args);

    // ensure idempotence
    let released = false;

    return () => {
      release();

      if (released) return;
      record.count--;
      if (record.count === 0) {
        delete this.locks[resolved];
      }

      released = true;
    };
  }
}
