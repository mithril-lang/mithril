import type {Seed as ImportedSeed} from './dep.js';
declare const Key: unique symbol;
declare class Hidden<T> { private brand; value: T; }
declare global {
 namespace GlobalModel {
  type Model<T> = Hidden<T>;
  type FromDependency<T> = ImportedSeed<T>;
  namespace Nested { type Owner<T> = Hidden<T>; }
  type Inline<T> = import('./inline.js').InlineSeed<T>;
 }
 interface GlobalModel<T> { [Key]: number; left: Hidden<T>; }
}
export {};
