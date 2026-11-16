export interface GraphNode { id:string; label?:string; types?:string[]; domain?:string; external?:boolean; [key:string]:unknown }
export interface GraphEdge { source:string; target:string; predicate?:string; [key:string]:unknown }
export interface GraphModel { nodes:GraphNode[]; edges:GraphEdge[] }
export type Layout = 'community' | 'orbit' | 'flow' | 'river';
export interface WorkflowPlan { nodes:Array<{id:string;op:string;[key:string]:unknown}>; edges:Array<{from:string;to:string;when?:{key:string;op:string;value?:unknown}}> }
export interface TraceStep {step:number;active:string[]|number;changed?:string[]|number;messages?:number;[key:string]:unknown}
export interface Computation {kind:'workflow'|'propagation';plan?:WorkflowPlan;result:{trace:TraceStep[];status?:string;pending?:string[];[key:string]:unknown}}
export interface Viewer {
 select(id:string):void;setLayout(value:Layout):void;setLocale(value:'en'|'ja'):void;setModel(value:GraphModel):void;
 setComputation(value:Computation|null):void;setStep(value:number):void;
 setRoute(ids:string[]):void;setPredicate(value:string):void;
 getState():{layout:Layout;selected:string|null;group:string;step:number;locale:'en'|'ja'};destroy():void;
}
export function validateModel(model:GraphModel):GraphModel;
export function mount(container:Element,options:{model:GraphModel;layout?:Layout;locale?:'en'|'ja';selected?:string;computation?:Computation;onSelect?:(id:string,node:GraphNode)=>void;onStep?:(step:number)=>void}):Viewer;
export * as layout from './layout.js';
