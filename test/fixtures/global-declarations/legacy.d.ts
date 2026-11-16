declare const LeftKey: unique symbol;
declare const RightKey: unique symbol;
declare class LeftHidden<T> { private brand; value: T; }
declare class RightHidden<T> { private brand; value: T; }
declare global {
 namespace GlobalModel { type Model<T> = LeftHidden<T>; namespace Nested { type Owner<T> = LeftHidden<T>; } }
 interface GlobalModel<T> { [LeftKey]: number; left: LeftHidden<T>; }
}
declare global {
 namespace GlobalModel { type OtherModel<T> = RightHidden<T>; }
 interface GlobalModel<T> { [RightKey]: string; right: RightHidden<T>; }
}
export type Left = GlobalModel<string>['left'];
export type Right = GlobalModel<string>['right'];
