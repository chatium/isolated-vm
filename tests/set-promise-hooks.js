const ivm = require('isolated-vm');
const assert = require('assert')
const isolate = new ivm.Isolate();
const context = isolate.createContextSync();
const logs = [];
context.evalClosureSync(
  `
  const context = $0;
  function prepareArg(arg) {
    if (Array.isArray(arg)) {
      return '[' + arg.map(prepareArg).join(',') + ']'
    }
    return arg?.toString() ?? String(arg);
  }
  const log = (...args) => $1.applySync(null, args.map(prepareArg));
  const init_hook = function init_hook(...args) { log('init_hook', args) };
  const before_hook = function before_hook(...args) { log('before hook', args) };
  const after_hook = function after_hook(...args) { log('after hook', args) };
  const resolve_hook = function resolve_hook(...args) { log('resolve_hook', args) };
  context.setPromiseHooksSync(init_hook, before_hook, after_hook, resolve_hook);
  
  async function main() {
    log('before await 1')
    await 1;
    log('before await 2')
    await 2
    log('after await 2')
  }
  log('before main()')
  main()
  log('after main()')
  `,
  [context, new ivm.Reference((...args) => {
    logs.push(args);
  })],
  {
    result: { copy: true }
  }
)
context.release();
process.nextTick(() => {});
isolate.dispose();
const expectedLogs =  [
  [ 'before main()' ],
  [ 'init_hook', '[[object Promise],undefined]' ],
  [ 'before await 1' ],
  [ 'init_hook', '[[object Promise],[object Promise]]' ],
  [ 'init_hook', '[[object Promise],[object Promise]]' ],
  [ 'resolve_hook', '[[object Promise]]' ],
  [ 'after main()' ],
  [ 'before hook', '[[object Promise]]' ],
  [ 'before await 2' ],
  [ 'init_hook', '[[object Promise],[object Promise]]' ],
  [ 'init_hook', '[[object Promise],[object Promise]]' ],
  [ 'resolve_hook', '[[object Promise]]' ],
  [ 'resolve_hook', '[[object Promise]]' ],
  [ 'after hook', '[[object Promise]]' ],
  [ 'before hook', '[[object Promise]]' ],
  [ 'after await 2' ],
  [ 'resolve_hook', '[[object Promise]]' ],
  [ 'resolve_hook', '[[object Promise]]' ],
  [ 'after hook', '[[object Promise]]' ]
]
assert.deepStrictEqual(logs, expectedLogs)
console.log('pass')
