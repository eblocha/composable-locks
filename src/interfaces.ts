export type Releaser = () => void;

/**
 * Lock interface, defines the methods a lock must implement
 */
export interface ILock<TArgs extends unknown[]> {
  acquire(...args: TArgs): Promise<Releaser>;
  waitForUnlock(...args: TArgs): Promise<void>;
}
