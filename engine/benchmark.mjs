import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import createEngine from '../frontend/public/engine/physics.mjs';

const current = await createEngine();
const baselinePath = process.argv.slice(2).find(value => !value.startsWith("--"));
const timingOnly = process.argv.includes("--timing-only");
const baseline = baselinePath
  ? await (await import(pathToFileURL(resolve(baselinePath)).href)).default()
  : null;
const body = (x, y, kind = 0) => [kind, x, y, .1, .1, 0, 1, .5, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const floor = [9, 0, 1.05, 10, .1, 0, 0, .5, 0, 0, 0, 0, 1, 0, 0, 0, 0];
const scenes = [20, 100, 200].map(count => ({
  name: `${count} separated`, gravity: 0,
  bodies: Array.from({ length: count }, (_, i) => body((i % 20) * .2, Math.floor(i / 20) * .2)),
}));
scenes.push({
  name: '200 vertical moving bodies', gravity: 0,
  bodies: Array.from({ length: 200 }, (_, i) => {
    const b = body(0, i * .3);
    b[10] = .1;
    return b;
  }),
});
scenes.push({
  name: '100 stacked', gravity: 9.81,
  bodies: [...Array.from({ length: 100 }, (_, i) => body(((i % 10) - 4.5) * .3, 1 - Math.floor(i / 10) * .1)), floor],
});
scenes.push({
  name: '20 ropes', gravity: 9.81,
  bodies: Array.from({ length: 20 }, (_, i) => { const b = body(i * .3, 1); b[9] = .2; return b; }),
  links: Array.from({ length: 20 }, (_, i) => [4, i, -1, i * .3, 0, 0, 0, 0, 0, 1, 0, 0, -1]),
  drag: [0, 2, 3],
});
scenes.push({
  name: '20 rotating hinges', gravity: 9.81,
  bodies: Array.from({ length: 20 }, (_, i) => body(i * .3, 0)),
  links: Array.from({ length: 20 }, (_, i) => [2, i, -1, i * .3 - .05, 0, -.05, 0, 0, 0, 0, 0, 0, -1]),
});
scenes.push({
  name: '40 mixed falling bodies', gravity: 9.81,
  bodies: [...Array.from({ length: 40 }, (_, i) => {
    const b = body(((i % 10) - 4.5) * .3, -Math.floor(i / 10) * .3, i % 2);
    b[5] = i * .07;
    b[11] = .2;
    return b;
  }), floor],
});
scenes.push({
  name: '100 rotating rods', gravity: 0,
  bodies: Array.from({ length: 100 }, (_, i) => { const b = body(i * .2, 0, 10); b[11] = .2; return b; }),
});
scenes.push({
  name: 'live contact edits', gravity: 9.81, bodies: [body(0, 1), floor],
  edit(engine, tick) {
    const edits = { 100: [0, 6, 2], 150: [0, 7, .2], 200: [0, 3, .15], 250: [0, 5, .1], 300: [1, 2, 2] };
    if (edits[tick]) assert.equal(engine._engine_body(...edits[tick]), 0);
  },
});
scenes.push({
  name: 'CCD repeated ricochets', gravity: 0,
  bodies: [
    [1, 0, 0, .1, .1, 0, 1, 0, 1, 1000, 0, 0, 0, 0, 0, 0, 0],
    [9, -.5, 0, 2, .001, Math.PI / 2, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0],
    [9, .5, 0, 2, .001, Math.PI / 2, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0],
  ],
});
function run(engine, scene) {
  const links = scene.links ?? [], start = engine._engine_input() / 8;
  engine.HEAPF64.fill(0, start, start + 200 * 17 + 400 * 16);
  scene.bodies.forEach((row, i) => engine.HEAPF64.set(row, start + i * 17));
  links.forEach((row, i) => engine.HEAPF64.set(row, start + 200 * 17 + i * 16));
  assert.equal(engine._engine_reset(scene.bodies.length, links.length, scene.gravity), 0);
  const times = [], digest = createHash('sha256');
  for (let tick = 0; tick < 480; ++tick) {
    scene.edit?.(engine, tick);
    const begin = performance.now();
    const status = engine._engine_tick(...(scene.drag ?? [-1, 0, 0]));
    const elapsed = performance.now() - begin;
    assert.equal(status, 0);
    if (tick >= 360) times.push(elapsed);
    assert.equal(engine._engine_sample(engine._engine_time()), 0);
    const count = engine._engine_force_count();
    for (const [ptr, length] of [
      [engine._engine_output(), scene.bodies.length * 6],
      [engine._engine_observables(), scene.bodies.length * 20],
      [engine._engine_force_output(), count * 7],
    ]) {
      const values = engine.HEAPF64.subarray(ptr / 8, ptr / 8 + length);
      assert.ok(values.every(Number.isFinite));
      digest.update(Buffer.from(values.buffer, values.byteOffset, values.byteLength));
    }
  }
  times.sort((a, b) => a - b);
  return { median: times[60], p95: times[114], digest: digest.digest('hex') };
}
for (const scene of scenes) {
  const before = baseline && run(baseline, scene);
  const after = run(current, scene);
  if (before && !timingOnly) assert.equal(after.digest, before.digest, `${scene.name}: state, forces or observables changed`);
  console.log(`${scene.name}: ${after.median.toFixed(3)} ms/tick, p95 ${after.p95.toFixed(3)}` +
    (before ? `; baseline ${before.median.toFixed(3)}, speedup ${(before.median / after.median).toFixed(2)}x; ${before.digest === after.digest ? "bitwise identical" : "physics changed"}` : ''));
}
