import Imported from './a.js';
import * as NS from './a.js';
export {default,default as Named,count,bump} from './a.js';
export type ImportedConstructor=typeof Imported;
export type NamespaceConstructor=typeof NS.default;
export type InlineInstance=import('./a.js').default<string>;
