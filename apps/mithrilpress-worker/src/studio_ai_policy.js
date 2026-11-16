// Mithril native JS host module; explicit grants; native runtime semantics.
export function instantiateMithrilNative(__mithril_native_grants){
if(__mithril_native_grants===null||typeof __mithril_native_grants!=='object')throw new Error('host-grant-mismatch');
const __mithril_native_keys=Reflect.ownKeys(__mithril_native_grants);
if(__mithril_native_keys.length!==0||__mithril_native_keys.some(k=>![].includes(k)))throw new Error('host-grant-mismatch');
const __mithril_native_f0=function isWorkersFreeAiEnabled(__mithril_native_v1,__mithril_native_v2){return ((((__mithril_native_v1)?.["STUDIO_AI_ENABLED"]==="true")&&((__mithril_native_v1)?.["STUDIO_AI_MODE"]===__mithril_native_v2))&&(((__mithril_native_v1)?.["STUDIO_AI_FREE_PLAN_CONFIRMED"]==="true")&&((typeof ((__mithril_native_v1)?.["AI"])?.["run"])==="function")));};
const __mithril_native_f1=function workersFreeAiMode(){return "workers-free-only";};
return {["isWorkersFreeAiEnabled"]:__mithril_native_f0,["workersFreeAiMode"]:__mithril_native_f1};
}
