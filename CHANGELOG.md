## v6.1.2-chatium.4
- `context.installClockSync()` added: returns a native function giving the nanoseconds since its creation
  from a monotonic clock (`std::chrono::steady_clock`), for timing inside promise hooks. It defines no
  global and must be called from inside the context's own isolate (e.g. via `evalClosure`). Despite the
  name it installs nothing: it creates and returns the clock function (no async counterpart). The name is
  kept because Chatium's ADR 0007, runbooks, docs and tests refer to it.
- `bench/promise-hook-clock.js` micro-benchmark for promise hook and clock read overhead.

## v4.3.0
- v8 inspector API fixed in nodejs v16.x
- `release` method added to `Module`

## v4.2.0
- `accessors` option added to `reference.get()`

## v4.1.0
- Support for nodejs v16.x
- `onCatastrophicError` added
- Fix for `null` error thrown from callback

## v4.0.0
- `Callback` class addeed.
- When possible, `reference.get()` will return a function delegate instead of a `Reference`.
- `reference.get()` will no longer return inherited properties by default.
- `result` property on `eval` and `evalClosure` has been removed. The result is now just the return
value.
- All `isolated-vm` class prototypes, and most instances are frozen.
- `isolate.cpuTime` and `isolate.wallTime` now return bigints.
- Proxies and accessors are no longer tolerated via `reference.get`, and related functions.
