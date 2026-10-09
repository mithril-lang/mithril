export const prefix=`import * as A from "@deepseek-ai/dsh-typert-protocol";import {Context,Service} from "@deepseek-ai/cordis";import {brandString,Branded} from "@deepseek-ai/dsh-brand";
type Equal<X,Y>=(<T>()=>T extends X?1:2) extends (<T>()=>T extends Y?1:2)?true:false;type Assert<T extends true>=T;
`;
export const augmentation=`import {Context} from "@deepseek-ai/cordis";import type {TypertContext,TypertLookup} from "@deepseek-ai/dsh-typert-protocol";
interface Subject{readonly id:string}interface Request{readonly agent:Subject;readonly signal?:AbortSignal;readonly nested:readonly [{readonly owner?:Subject}];readonly transform:(subject:Subject)=>Promise<Subject|undefined>}
declare module "@deepseek-ai/cordis"{interface Events{"fixture/notice"(value:string):void;"fixture/scoped"(this:Context,value:string):void;"fixture/waterfall"(this:Context,request:Request,next:()=>Promise<string>):Promise<string>;"fixture/answered"(value:string):string}}
declare module "@deepseek-ai/dsh-typert-protocol"{interface TypertLookupMap{fixture:TypertLookup<Subject,string>}interface TypertContextMap{fixture:TypertContext<string>;other:TypertContext<number>}interface TypertRemoteEventSelection extends Record<"fixture/notice"|"fixture/waterfall"|"fixture/absent",true>{}interface TypertRemoteMap{"goals/create":(value:string)=>Promise<string>;"other/read":()=>number}interface TypertRemoteScopeMap{"fixture:goals/read":()=>Promise<number>;"other:goals/read":()=>Promise<string>}interface RemoteErrorDetailsMap{"owner/failure":{readonly retry:boolean}}}
`;
export const cases=[
 ['binding','const s={};const b:A.TypertGatewayBinding<typeof s>=A.bindTypertRemote(s,"service");const name:string=b.namespace;',[]],
 ['service owner','class S extends A.TypertRemoteService {constructor(ctx:Context){super(ctx,"service")} }const service:Service<never>=new S(new Context());',[]],
 ['decorators','class S{ @A.Remote method(s:string){return s} @A.Remote({mode:"stream"}) *watch(){yield 1} @A.RemoteScope("fixture") read(){return 1} }',[]],
 ['brand owner','const id:A.PeerId=brandString<A.PeerId>("p");const same:Branded<"PeerId">=id;',[]],
 ['owned disposable','const owned:A.TypertOwnedValue<number>=A.typertOwnedValue(1,()=>{});owned[Symbol.dispose]();const n:number=owned.value;',[]],
 ['owned narrowing','declare const x:unknown;if(A.isTypertOwnedValue(x)){const y:A.TypertOwnedValue<unknown>=x}',[]],
 ['lookup extraction','type Check=Assert<Equal<A.TypertLookupHost<A.TypertLookup<{id:string},number>>,{id:string}>>;type Wire=Assert<Equal<A.TypertLookupWire<A.TypertLookup<object,number>>,number>>;',[]],
 ['context extraction','type Check=Assert<Equal<A.TypertContextWire<A.TypertContext<string>>,string>>;',[]],
 ['namespace mapping','declare const api:A.TypertRemoteNamespace<"goals">;const result:Promise<string>=api.create("x");',[]],
 ['scope namespace mapping','declare const api:A.TypertRemoteScopeApi<"fixture">;const result:Promise<number>=api.goals.read();',[]],
 ['event selection','type Check=Assert<Equal<A.TypertRemoteEvent,"fixture/notice"|"fixture/waterfall">>;',[]],
 ['event projection','type Listener=A.TypertClientEventListener<"fixture/waterfall">;type Request=Parameters<Listener>[0];type Agent=Assert<Equal<Request["agent"],Context>>;type Nested=Assert<Equal<Request["nested"],readonly [{readonly owner?:{readonly id:string}}]>>;type Notice=Assert<Equal<A.TypertClientEventListener<"fixture/notice">,(value:string)=>void>>;',[]],
 ['error code details','const e=new A.RemoteError("owner/failure","error",{retry:true});const b:boolean=e.details.retry;const marker:true=e.isDSHRemoteError;',[]],
 ['error discrimination','declare const result:A.RemoteResult<number>;if(!result.ok&&result.error.code==="owner/failure"){const b:boolean=result.error.details.retry}',[]],
 ['cordis augmentation','const ctx=new Context();const invocation:A.RemoteInvocation|undefined=ctx.invocation;const registry:A.TypertRegistryContract=ctx.typert;',[]],
 ['stream types','declare const stream:A.RemoteStreamHandle<number,string>;const dispose:void=stream.dispose();const items:AsyncIterable<number>=stream;',[]],
 ['plain peer','const id:A.PeerId="plain";',[2322]],
 ['foreign peer brand','declare const id:Branded<"SessionId">;const peer:A.PeerId=id;',[2322]],
 ['readonly binding','const b=A.bindTypertRemote({},"s");b.namespace="changed";',[2540]],
 ['readonly owned','A.typertOwnedValue(1,()=>{}).value=2;',[2540]],
 ['forge owned','const owned:A.TypertOwnedValue<number>={value:1,[Symbol.dispose](){}};',[2741]],
 ['forge lookup','const lookup:A.TypertLookup<object,string>={};',[2739]],
 ['forge context','const ctx:A.TypertContext<string>={};',[2741]],
 ['invalid scope key','A.RemoteScope("missing");',[2345]],
 ['invalid mode','A.Remote({mode:"unary"});',[2322]],
 ['missing direct method','declare const api:A.TypertRemoteNamespace<"goals">;api.read();',[2339]],
 ['namespace argument','declare const api:A.TypertRemoteNamespace<"goals">;api.create(1);',[2345]],
 ['scoped return','declare const api:A.TypertRemoteScopeApi<"fixture">;const result:Promise<string>=api.goals.read();',[2322]],
 ['rejected event','type L=A.TypertClientEventListener<"fixture/scoped">;',[2344]],
 ['wrong failure details','new A.RemoteError("owner/failure","error",{retry:1});',[2322]],
 ['unknown failure code','new A.RemoteError("missing","error",{});',[2345]],
 ['readonly invocation','new Context().invocation=undefined;',[2540]],
];
