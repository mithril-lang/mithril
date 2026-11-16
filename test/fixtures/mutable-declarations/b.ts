import { count as Imported } from './a.js';
import * as NS from './a.js';
export { count as forwarded } from './a.js';
export type ImportedValue = typeof Imported;
export type NamespaceValue = typeof NS.count;
export type InlineValue = typeof import('./a.js').count;
