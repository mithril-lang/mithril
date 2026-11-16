// Mithril native JS host module; explicit grants; native runtime semantics.
export function instantiateMithrilNative(__mithril_native_grants){
if(__mithril_native_grants===null||typeof __mithril_native_grants!=='object')throw new Error('host-grant-mismatch');
const __mithril_native_keys=Reflect.ownKeys(__mithril_native_grants);
if(__mithril_native_keys.length!==0||__mithril_native_keys.some(k=>![].includes(k)))throw new Error('host-grant-mismatch');
const __mithril_native_f0=function siteHostname(__mithril_native_v1){return ((((typeof __mithril_native_v1)==="string")&&(((__mithril_native_v1)["length"]>0)&&((__mithril_native_v1)["length"] <= 253)))?(()=>{const __mithril_native_v2=((__mithril_native_v1)["toLowerCase"]())["replace"]((/\.$/),"");const __mithril_native_v3=".sites.mithril.love";return ((__mithril_native_v2)["endsWith"](__mithril_native_v3)?(()=>{const __mithril_native_v4=(__mithril_native_v2)["slice"](0,((__mithril_native_v2)["length"] - (__mithril_native_v3)["length"]));return (((/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/))["test"](__mithril_native_v4)&&((! ((/^(?:www|admin|api|assets|preview|mail|status|support|docs|help|root)$/))["test"](__mithril_native_v4))&&__mithril_native_v2));})():null);})():null);};
return {["siteHostname"]:__mithril_native_f0};
}
