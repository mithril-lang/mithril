export function chain(base,key,arg,tail){return base?.[key()]?.(arg())[tail()];}
export function method(base,key,arg){return base[key()]?.(arg());}
export function receiver(base,key,arg){return base?.[key()](arg());}
export function valueCall(base,arg){return base?.(arg());}
export function spread(base,key,arg,iter){return base?.[key()]?.(arg(),...iter());}
export function grouped(base,key,arg){return (base?.[key()]?.(arg())).tail;}
export async function awaitKey(base,key,arg){return base?.[await key()]?.(await arg());}
export function* yieldKey(base){return base?.[yield 'key']?.(yield 'arg');}
export function initialize(instance,initKey){return instance?.[initKey]?.();}
export function taskCleanup(task,runner,dispose,finalizeDisposal){return task?.catch(() => {
            if (!runner.epoch)
                return dispose();
            return finalizeDisposal(dispose);
        }).catch((error) => this.ctx.logger.error(error));}
export function returnedCall(base){return base.get()?.(1);}
