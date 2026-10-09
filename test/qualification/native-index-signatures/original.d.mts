export interface StringMap<T=unknown> { [key: string]: T }
export interface NumberMap { readonly [index: number]: number }
export interface SymbolMap { [key: symbol]: boolean }
export interface MixedMap { [key: string]: string | number; [index: number]: number; known: number }
export type Inline = { readonly [key: string]: {value: number} }
export interface Augmented { [key: string]: unknown }
export interface Augmented { value: number }
export interface KeyNamed { [key: string]: string; key: string }
