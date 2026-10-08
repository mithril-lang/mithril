// Exact original Spread alias; echo is an observation signature, not Context.plugin.
type Spread<T> = undefined extends T ? [config?: T] : [config: T]
export declare function echo<T>(...args: Spread<T>): T;
export {};
