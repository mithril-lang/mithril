import type {GraphNode,GraphEdge,GraphModel,WorkflowPlan,Computation} from './index.js';
export interface Point {id:string;x:number;y:number;group?:string;tier?:number}
export const groups:Array<{id:string;label:string;color:string;fill:string}>;
export function groupFor(node:GraphNode):string;
export function community(nodes:GraphNode[],edges:GraphEdge[],options?:{group?:string;priority?:string[]}):{points:Point[];regions:Array<{id:string;label:string;color:string;fill:string;x:number;y:number;w:number;h:number;total:number;shown:number}>;bridges:Array<{source:string;target:string;count:number}>;edges:GraphEdge[];total:number;shown:number;group:string};
export function orbit(model:GraphModel,center:string,options?:{predicate?:string;priority?:string[]}):{points:Point[];edges:GraphEdge[];totalFirst:number;shownFirst:number;totalSecond:number;shownSecond:number};
export function flow(program:WorkflowPlan):{nodes:Array<{id:string;op:string;x:number;y:number;column:number;lane:number;slot:number;cycle:boolean}>;edges:WorkflowPlan['edges'];width:number;height:number;lanes?:Array<{label:string;y:number;height:number}>};
export function history(result:Computation['result']):{actors:string[];steps:Array<Record<string,unknown>>;width:number;height:number};
export function labels(points:Point[],byId:Map<string,GraphNode>,options?:{width?:number;height?:number;center?:string|null}):Array<{id:string;text:string;x:number;y:number;w:number;h:number}>;
