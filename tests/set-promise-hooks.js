const ivm = require('isolated-vm');
const assert = require('assert')
const isolate = new ivm.Isolate();
const context = isolate.createContextSync();
const logs = [];
context.evalClosureSync(
  `
  const context = $0;
  const promiseIds = new WeakMap();
  let nextPromiseId = 1;
  function prepareArg(arg) {
    if (Array.isArray(arg)) {
      return '[' + arg.map(prepareArg).join(',') + ']'
    }
    if (arg instanceof Promise) {
      if (!promiseIds.has(arg)) {
        promiseIds.set(arg, nextPromiseId++);
      }
      return 'Promise#' + promiseIds.get(arg);
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
  [ 'init_hook', '[Promise#1,undefined]' ],
  [ 'before await 1' ],
  [ 'init_hook', '[Promise#2,Promise#1]' ],
  [ 'resolve_hook', '[Promise#2]' ],
  [ 'init_hook', '[Promise#3,Promise#2]' ],
  [ 'after main()' ],
  [ 'before hook', '[Promise#3]' ],
  [ 'before await 2' ],
  [ 'init_hook', '[Promise#4,Promise#1]' ],
  [ 'resolve_hook', '[Promise#4]' ],
  [ 'init_hook', '[Promise#5,Promise#4]' ],
  [ 'resolve_hook', '[Promise#3]' ],
  [ 'after hook', '[Promise#3]' ],
  [ 'before hook', '[Promise#5]' ],
  [ 'after await 2' ],
  [ 'resolve_hook', '[Promise#1]' ],
  [ 'resolve_hook', '[Promise#5]' ],
  [ 'after hook', '[Promise#5]' ]
]
assert.deepStrictEqual(logs, expectedLogs)
console.log('pass')
