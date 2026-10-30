'use strict';
const ivm = require('isolated-vm');
const assert = require('assert');

(async () => {
	const isolate = new ivm.Isolate();
	const context = isolate.createContextSync();

	// Returns a function, defines no global
	const globalsBefore = JSON.parse(context.evalSync('JSON.stringify(Reflect.ownKeys(globalThis).map(String))'));
	const sync = context.evalClosureSync(`
		const clock = $0.installClockSync();
		globalThis.__clock = clock;
		const values = [];
		for (let ii = 0; ii < 1000; ++ii) {
			values.push(clock());
		}
		let monotonic = true;
		let finite = true;
		// a coarse clock repeats values: only strictly positive steps tell the resolution
		let minPositiveDiff = Infinity;
		for (let ii = 0; ii < values.length; ++ii) {
			finite = finite && typeof values[ii] === 'number' && Number.isFinite(values[ii]) && values[ii] >= 0;
			if (ii > 0) {
				const diff = values[ii] - values[ii - 1];
				monotonic = monotonic && diff >= 0;
				if (diff > 0) {
					minPositiveDiff = Math.min(minPositiveDiff, diff);
				}
			}
		}
		const distinct = new Set(values).size;
		const a = clock();
		const b = clock();
		let threw = false;
		try {
			new clock();
		} catch (err) {
			threw = true;
		}
		return { type: typeof clock, monotonic, finite, minPositiveDiff, distinct, pairDiff: b - a, constructThrows: threw };
	`, [ context ], { result: { copy: true } });
	assert.strictEqual(sync.type, 'function');
	assert.ok(sync.finite, 'values are finite non-negative numbers');
	assert.ok(sync.monotonic, 'values are monotonic');
	assert.ok(sync.pairDiff >= 0 && sync.pairDiff < 1e6, `two calls differ by less than 1 ms (${sync.pairDiff})`);
	// a millisecond clock would give a handful of distinct values over 1000 back-to-back calls
	assert.ok(sync.distinct > 100, `sub-microsecond steps (${sync.distinct} distinct values of 1000)`);
	assert.ok(sync.minPositiveDiff < 1000, `resolution well below 1 us (min positive step ${sync.minPositiveDiff} ns)`);
	assert.ok(sync.constructThrows, 'clock is not a constructor');
	context.evalSync('delete globalThis.__clock');
	const globalsAfter = JSON.parse(context.evalSync('JSON.stringify(Reflect.ownKeys(globalThis).map(String))'));
	assert.deepStrictEqual(globalsAfter, globalsBefore, 'installClockSync defines no global');

	// Every clock counts from its own creation
	const bases = context.evalClosureSync(`
		const first = $0.installClockSync();
		const end = Date.now() + 5;
		while (Date.now() < end) {}
		const second = $0.installClockSync();
		const secondReading = second();
		const firstReading = first();
		return { firstReading, secondReading };
	`, [ context ], { result: { copy: true } });
	assert.ok(bases.firstReading - bases.secondReading >= 4e6,
		`a later clock reads lower (${bases.firstReading} vs ${bases.secondReading})`);

	// Calling it from outside the context's isolate throws
	assert.throws(() => context.installClockSync(), /inside the context's own isolate/);

	// Works from inside promise hooks, and keeps advancing across an await of a host timer
	const sleep = new ivm.Reference(ms => new Promise(resolve => setTimeout(resolve, ms)));
	const result = await context.evalClosure(`
		const context = $0;
		const sleep = $1;
		const clock = context.installClockSync();
		const readings = { before: [], after: [] };
		const noop = () => {};
		context.setPromiseHooksSync(
			noop,
			() => { readings.before.push(clock()); },
			() => { readings.after.push(clock()); },
			noop,
		);
		return (async () => {
			const start = clock();
			await sleep.apply(undefined, [ 20 ], { result: { promise: true } });
			const elapsed = clock() - start;
			context.setPromiseHooksSync(noop, noop, noop, noop);
			const all = [ ...readings.before, ...readings.after ];
			return {
				elapsed,
				hookCalls: all.length,
				hookValuesOk: all.every(value => typeof value === 'number' && Number.isFinite(value)),
			};
		})();
	`, [ context, sleep ], { result: { copy: true, promise: true } });
	assert.ok(result.hookCalls > 0, 'promise hooks called the clock');
	assert.ok(result.hookValuesOk, 'clock returns numbers inside promise hooks');
	// The isolate thread is idle while waiting for the host timer: a thread CPU clock would barely move
	assert.ok(result.elapsed >= 15e6 && result.elapsed < 1e9,
		`clock advanced across a 20 ms host timer in nanoseconds (${result.elapsed} ns)`);

	context.release();
	isolate.dispose();
	console.log('pass');
})().catch(err => {
	console.error(err);
	process.exit(1);
});
