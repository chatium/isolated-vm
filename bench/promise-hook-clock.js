'use strict';
// Micro-benchmark: cost of V8 promise hooks and of reading the `installClockSync()` clock inside them.
// Not part of `npm test`. Run: `node bench/promise-hook-clock.js` (optionally `ITERATIONS=... RUNS=...`).
//
// One isolate, one context, a loop of `await Promise.resolve()` (one promise reaction per iteration, so the
// before/after hooks fire once each per iteration). Modes:
// - none:    no promise hooks installed
// - hooks:   all four hooks installed as empty functions
// - clock:   before/after hooks each read the clock once (two reads per reaction, as the UGC runtime does)
// - dateNow: same with `Date.now()`, for reference
// Promise hooks cannot be removed from a context once set, so the `none` runs go first; the hook modes are
// then interleaved round by round to spread drift evenly. Prints the median ns per iteration over the runs.
const ivm = require('isolated-vm');

const iterations = Number(process.env.ITERATIONS ?? 200_000);
const runs = Number(process.env.RUNS ?? 5);

const median = values => {
	const sorted = [ ...values ].sort((left, right) => left - right);
	const middle = sorted.length >> 1;
	return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

(async () => {
	const isolate = new ivm.Isolate();
	const context = isolate.createContextSync();
	context.evalClosureSync(`
		const context = $0;
		const clock = context.installClockSync();
		let sink = 0;
		const noop = () => {};
		const modes = {
			hooks: [ noop, noop, noop, noop ],
			clock: [ noop, () => { sink += clock(); }, () => { sink += clock(); }, noop ],
			dateNow: [ noop, () => { sink += Date.now(); }, () => { sink += Date.now(); }, noop ],
		};
		globalThis.setMode = mode => {
			if (mode !== 'none') {
				context.setPromiseHooksSync(...modes[mode]);
			}
		};
		globalThis.runLoop = async iterations => {
			const start = clock();
			for (let ii = 0; ii < iterations; ++ii) {
				await Promise.resolve();
			}
			return (clock() - start) / iterations + sink * 0;
		};
	`, [ context ]);

	const runOnce = async mode => {
		await context.evalClosure('setMode($0)', [ mode ]);
		return context.evalClosure('return runLoop($0)', [ iterations ], { result: { promise: true } });
	};

	const results = { none: [], hooks: [], clock: [], dateNow: [] };
	// Warm up the loop without hooks, then measure `none` before any hooks exist in the context
	await runOnce('none');
	for (let ii = 0; ii < runs; ++ii) {
		results.none.push(await runOnce('none'));
	}
	const hookModes = [ 'hooks', 'clock', 'dateNow' ];
	for (const mode of hookModes) {
		await runOnce(mode);
	}
	for (let ii = 0; ii < runs; ++ii) {
		for (const mode of hookModes) {
			results[mode].push(await runOnce(mode));
		}
	}

	const medians = Object.fromEntries(Object.entries(results).map(([ mode, values ]) => [ mode, median(values) ]));
	console.log(`node ${process.version} ${process.platform}/${process.arch}, ${iterations} iterations x ${runs} runs`);
	for (const [ mode, value ] of Object.entries(medians)) {
		console.log(`${mode.padEnd(8)} ${value.toFixed(1).padStart(8)} ns/iter  runs: ${results[mode].map(value => value.toFixed(1)).join(', ')}`);
	}
	console.log(`hooks over none:   ${(medians.hooks - medians.none).toFixed(1)} ns/iter`);
	console.log(`clock over hooks:  ${(medians.clock - medians.hooks).toFixed(1)} ns/iter (gate: <= 100)`);
	console.log(`Date.now over hooks: ${(medians.dateNow - medians.hooks).toFixed(1)} ns/iter`);
	context.release();
	isolate.dispose();
})().catch(err => {
	console.error(err);
	process.exit(1);
});
