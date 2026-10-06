/** Execute only the typed primitive nodes emitted by the Mithril block assembler. */
export function createCore(program) {
  const functions = new Map(program.functions.map(f => [f.id, f]));
  function invoke(id, args) {
    const f = functions.get(id);
    if (!f || args.length !== 1) throw new Error('Invalid Mithril function call');
    if (f.arg.type === 'bool' ? typeof args[0] !== 'boolean' : !Array.isArray(args[0]) || !args[0].every(x => typeof x === 'boolean')) throw new Error('Invalid completion state');
    let fuel = 512;
    function evaluate(node) {
      if (--fuel < 0) throw new Error('Mithril evaluation budget exhausted');
      if (node.kind === 'argument') return args[node['argument-index']];
      if (node.kind === 'literal') return node.value;
      if (node.kind === 'reference') return value => invoke(node['function-ref'], [value]);
      if (node.kind !== 'operation') throw new Error('Unknown Mithril node');
      if (node.id === 'if-:bool') return evaluate(node.children[0]) ? evaluate(node.children[1]) : evaluate(node.children[2]);
      if (node.id === 'filter-vector-bool') { const predicate = evaluate(node.children[0]); return evaluate(node.children[1]).filter(predicate); }
      if (node.id === 'count-vector-bool') return evaluate(node.children[0]).length;
      throw new Error('Unregistered Mithril operation');
    }
    return evaluate(program.bodies[id]);
  }
  return { toggle: done => invoke('toggle', [done]), remaining: states => invoke('remaining', [states]) };
}
