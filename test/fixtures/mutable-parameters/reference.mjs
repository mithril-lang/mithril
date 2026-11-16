export function moduleWrite(value,read=()=>value){value=11;return [value,read()];}
export function closure(value,read=()=>value,write=next=>value=next){value=2;return [value,read(),read,write,arguments.length];}
export function defaultWrite(value=1,next=value=3){return [value,next];}
export function tdz(value=value=2){return value;}
export function shadow(value,read=()=>value){{const value=9;return [value,read()];}}
export const arrowPattern=([a,b])=>(a=b,b=7,[a,b]);
export const arrowDefault=(value=1,read=()=>value)=>(value=4,read());
export async function asyncSet(value){value=await value;return value;}
export function* generatorSet(value){value=yield value;return value;}
export async function* asyncGeneratorSet(value){value=yield await value;return value;}
export class Box{constructor(value,read=()=>value){value=5;this.read=read;this.value=value;}update(value,read=()=>value){value=6;return [value,read()];}}
export const object={update(value,read=()=>value){value=8;return [value,read()];}};
export class EventsOnFixture{constructor(ctx,hooks){this.ctx=ctx;this._hooks=hooks;}
    on(name, listener, options) {
        if (typeof options !== 'object') {
            options = { prepend: options };
        }
        // handle special events
        this.ctx.fiber.assertActive();
        listener = this.ctx.reflect.bind(listener);
        const result = this.bail(this.ctx, 'internal/listener', name, listener, options);
        if (result)
            return result;
        const hooks = this._hooks[name] ||= [];
        const label = `ctx.on(${typeof name === 'string' ? JSON.stringify(name) : name.toString()})`;
        return this.register(label, hooks, listener, options);
    }
}
