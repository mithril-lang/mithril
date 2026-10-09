import './a.js';
import './b.js';
export type Left = GlobalModel<string>['left'];
export type Right = GlobalModel<string>['right'];
export type Dependency = GlobalModel.FromDependency<string>;
export type Inline = GlobalModel.Inline<string>;
