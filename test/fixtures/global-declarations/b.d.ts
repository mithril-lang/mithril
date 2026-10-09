declare const Key: unique symbol;
declare class Hidden<T> { private brand; value: T; }
declare global {
 namespace GlobalModel { type OtherModel<T> = Hidden<T>; }
 interface GlobalModel<T> { [Key]: string; right: Hidden<T>; }
}
export {};
