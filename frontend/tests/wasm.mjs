import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import createEngine from "../public/engine/physics.mjs";
const engine = await createEngine();
const base = [0, 0, 0, 0.1, 0.1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
function reset(rows = [base], g = 9.81, links = []) {
  const start = engine._engine_input() / 8;
  engine.HEAPF64.fill(0, start, start + 200 * 17 + 400 * 16);
  rows.forEach((row, i) => engine.HEAPF64.set(row, start + i * 17));
  links.forEach((row, i) => {
    const data = Array(16).fill(0);
    data[12] = -1;
    row.forEach((v, j) => (data[j] = v));
    engine.HEAPF64.set(data, start + 200 * 17 + i * 16);
  });
  assert.equal(engine._engine_reset(rows.length, links.length, g), 0);
}
function ticks(n) {
  for (let i = 0; i < n; i++) assert.equal(engine._engine_tick(-1, 0, 0), 0);
}
function sample(t = engine._engine_time(), count = 1) {
  assert.equal(engine._engine_sample(t), 0);
  return Array.from(
    engine.HEAPF64.subarray(
      engine._engine_output() / 8,
      engine._engine_output() / 8 + count * 6,
    ),
  );
}
function trajectory(x, y = "0", angle = "0") {
  const ptr = engine._engine_formulas();
  engine.HEAPU8.fill(0, ptr, ptr + 768);
  [x, y, angle].forEach((s, i) =>
    engine.HEAPU8.set(new TextEncoder().encode(s), ptr + i * 256),
  );
  return engine._engine_trajectory(0, 1);
}
reset();
ticks(240);
const fall = sample();
assert.ok(Math.abs(fall[1] - 4.905) < 0.003);
assert.ok(Math.abs(fall[4] - 9.81) < 1e-10);
assert.equal(engine._engine_time(), 1);
reset();
ticks(240);
assert.deepEqual(sample(), fall);
assert.equal(engine._engine_body(0, 6, -1), 1);
assert.equal(engine._engine_body(0, 1, NaN), 1);
assert.equal(engine._engine_sample(-1), 1);
reset();
assert.equal(engine._engine_force(0, 2, 0, 0, -9.81), 0);
ticks(240);
assert.ok(Math.abs(sample()[3] - 2) < 1e-10);
reset();
assert.equal(trajectory("0.3+0.05*sin(2*pi*t)", "0.2+t^2", "t"), 0);
ticks(120);
let p = sample();
assert.ok(Math.abs(p[0] - 0.3) < 1e-12);
assert.ok(Math.abs(p[1] - 0.45) < 1e-12);
assert.ok(Math.abs(p[3] + 0.1 * Math.PI) < 1e-10);
assert.ok(Math.abs(p[4] - 1) < 1e-12);
assert.ok(Math.abs(p[5] - 1) < 1e-12);
p = sample(0.499);
assert.ok(Math.abs(p[0] - (0.3 + 0.05 * Math.sin(2 * Math.PI * 0.499))) < 1e-9);
assert.ok(Math.abs(p[1] - (0.2 + 0.499 ** 2)) < 1e-10);
assert.equal(trajectory("window.alert(1)"), 2);
assert.equal(trajectory("1/0"), 2);
assert.equal(trajectory("sin("), 2);
reset();
assert.equal(trajectory("-t^2+2*t", "exp(t)", "cos(t)"), 0);
ticks(240);
p = sample();
assert.ok(Math.abs(p[0] - 1) < 1e-12);
assert.ok(Math.abs(p[3]) < 1e-12);
assert.ok(Math.abs(p[4] - Math.E) < 1e-12);
// Same physical result for display schedules of 60, 144 and 240 Hz.
const source = ts.transpileModule(
  readFileSync(new URL("../src/wasm-api.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.ESNext } },
).outputText;
const { FixedClock } = await import(
  "data:text/javascript;base64," + Buffer.from(source).toString("base64")
);
for (const hz of [60, 144, 240]) {
  reset();
  const clock = new FixedClock();
  for (let i = 0; i < hz; i++) ticks(clock.consume(1 / hz));
  assert.deepEqual(sample(), fall);
}
const clock = new FixedClock();
assert.equal(clock.consume(1), 24);
assert.ok(clock.dropped > 0.89);
// Contact, friction and rope constraints through the actual WASM ABI.
const floor = [...base];
floor[2] = 0.2;
floor[3] = 2;
floor[4] = 0.1;
floor[12] = 1;
reset([base, floor]);
ticks(240);
assert.ok(Math.abs(sample()[1] - 0.1) < 0.0002);
const sliding = [...base];
sliding[2] = 0.1;
sliding[9] = 1;
reset([sliding, floor]);
ticks(120);
assert.ok(Math.abs(sample()[3] - 1) < 1e-8);
sliding[7] = floor[7] = 0.5;
reset([sliding, floor]);
ticks(120);
assert.ok(Math.abs(sample()[3]) < 0.03);
const tethered = [...base];
tethered[1] = 0.1;
reset([tethered], 9.81, [[4, 0, -1, 0, 0, 0, 0, 0, 0, 0.1, 0, 0, 0]]);
for (let i = 0; i < 240; i++) assert.equal(engine._engine_tick(0, 1, 1), 0);
p = sample();
assert.ok(Math.hypot(p[0], p[1]) < 0.1001);
// Travel-limited substeps prevent a fast body crossing this thin wall.
const bullet = [...base];
bullet[3] = bullet[4] = 0.01;
bullet[9] = 10;
const wall = [...base];
wall[1] = 0.1;
wall[3] = 0.005;
wall[4] = 1;
wall[12] = 1;
reset([bullet, wall], 0);
ticks(5);
assert.ok(sample()[0] < 0.101);
console.log(
  "PASS WASM: determinism, free fall, forces, formulas and derivatives, trajectory sampling, frame-rate independence, overload bound, contact, friction, rope, fast collision",
);
function derived(i = 0) {
  return Array.from(
    engine.HEAPF64.subarray(
      engine._engine_observables() / 8 + i * 20,
      engine._engine_observables() / 8 + (i + 1) * 20,
    ),
  );
}
reset();
ticks(24);
assert.ok(Math.abs(derived()[3] - 9.81) < 1e-8);
assert.ok(Math.abs(derived()[17]) < 1e-8); // Weightlessness, despite mg.
reset([base, floor]);
ticks(240);
assert.ok(Math.abs(derived()[17] - 9.81) < 0.02);
assert.ok(Math.abs(derived()[5] + 9.81) < 0.02);
reset([base, floor]);
let settled = 0;
for (let i = 0; i < 6000; i++) {
  ticks(1);
  const r = engine._engine_relax();
  settled = r < 1e-4 ? settled + 1 : 0;
  if (settled >= 120) break;
}
assert.ok(settled >= 120, "static equilibrium must converge");
reset();
ticks(1);
assert.ok(
  engine._engine_relax() > 9,
  "unsupported falling body is not static equilibrium",
);
const fixed = [...base];
fixed[12] = 1;
fixed[6] = 0;
const lever = [...base];
lever[0] = 10;
lever[1] = 1;
lever[3] = 2;
lever[4] = 0.1;
reset([fixed, lever], 9.81, [[12, 1, 0, 0, 0, -1, 0, 0, 0, 0, 0, 0, -1, 0]]);
ticks(240);
let welded = sample(1, 2);
assert.ok(Math.abs(welded[7]) < 0.0001);
assert.ok(Math.abs(welded[8]) < 0.0001);
reset([fixed, lever], 9.81, [[2, 1, 0, 0, 0, -1, 0, 0, 0, 0, 0, 0, -1, 0]]);
ticks(48);
const hinged = sample(0.2, 2);
assert.ok(Math.abs(hinged[8]) > 0.03);
assert.ok(
  Math.hypot(hinged[6] - Math.cos(hinged[8]), hinged[7] - Math.sin(hinged[8])) <
    0.0001,
);
const loadA = [...base],
  loadB = [...base],
  wheel = [...base];
loadA[1] = -0.5;
loadA[2] = 2;
loadA[3] = loadA[4] = 0.2;
loadB[1] = 0.5;
loadB[2] = 2;
loadB[3] = loadB[4] = 0.2;
loadB[6] = 2;
wheel[0] = 5;
wheel[3] = wheel[4] = 1;
wheel[12] = 1;
reset([loadA, loadB, wheel], 9.81, [
  [10, 0, 1, 0, 0, 0, 0, 0, 0, 4 + Math.PI * 0.5, 0, 0, 2, 0],
]);
ticks(24);
const atwood = sample(0.1, 3);
const expected = (0.1 * 9.81) / 3.5;
assert.ok(
  Math.abs(atwood[4] + expected) < 0.02,
  `pulley inertia: ${atwood[4]} expected ${-expected}`,
);
assert.ok(Math.abs(atwood[10] - expected) < 0.02);
assert.ok(Math.abs(atwood[17]) > 0.1);
console.log(
  "PASS mechanics: weightlessness vs weight, support reactions, static convergence, unsupported residual, welded lever, revolute lever, finite-inertia pulley with wrap",
);
// Moving kinematic support transmits acceleration and weight through contact.
const platform = [...floor];
platform[12] = 2;
const passenger = [...base];
passenger[2] = 0.1;
reset([platform, passenger]);
assert.equal(trajectory("0", ".2-t^2", "0"), 0);
ticks(120);
const ride = sample(0.5, 2);
assert.ok(Math.abs(ride[7] - (0.1 - 0.25)) < 0.001);
assert.ok(Math.abs(derived(1)[17] - 11.81) < 0.08);
// Real contact load: ten stacks, each ten blocks, over a shared floor.
const ground = [...floor];
ground[2] = 1.1;
ground[3] = 5;
ground[7] = 0.5;
const stack = Array.from({ length: 100 }, (_, i) => {
  const b = [...base];
  b[1] = ((i % 10) - 4.5) * 0.3;
  b[2] = 1 - Math.floor(i / 10) * 0.1;
  b[7] = 0.5;
  return b;
});
reset([...stack, ground]);
const contactTimes = [];
for (let i = 0; i < 480; i++) {
  const begin = performance.now();
  ticks(1);
  if (i >= 360) contactTimes.push(performance.now() - begin);
}
const stacked = sample(2, 101);
assert.ok(stacked.every(Number.isFinite));
console.log(
  "stack diagnostic",
  Array.from({ length: 10 }, (_, j) => ({
    row: j,
    y: stacked[j * 60 + 1],
    angle: stacked[j * 60 + 2],
    v: stacked[j * 60 + 4],
  })),
);
for (let i = 0; i < 100; i++) {
  assert.ok(
    Math.abs(stacked[i * 6] - stack[i][1]) < 0.04,
    "stack horizontal drift",
  );
  assert.ok(
    Math.abs(stacked[i * 6 + 1] - stack[i][2]) < 0.01,
    "stack penetration",
  );
  assert.ok(
    Math.abs(stacked[i * 6 + 4]) < 0.04,
    "stack rest velocity " + i + ": " + stacked[i * 6 + 4],
  );
}
contactTimes.sort((a, b) => a - b);
console.log(
  `WASM 100 stacked bodies: median ${contactTimes[60].toFixed(3)} ms/tick, p95 ${contactTimes[114].toFixed(3)} ms/tick`,
);
// Twenty constrained pendulums, with drag force bounded by their ropes.
const pendulums = Array.from({ length: 20 }, (_, i) => {
  const b = [...base];
  b[1] = i * 0.3;
  b[2] = 1;
  b[9] = 0.2;
  return b;
});
const ropes = pendulums.map((b, i) => [
  4,
  i,
  -1,
  b[1],
  0,
  0,
  0,
  0,
  0,
  1,
  0,
  0,
  -1,
]);
reset(pendulums, 9.81, ropes);
const linkTimes = [];
for (let i = 0; i < 480; i++) {
  const begin = performance.now();
  assert.equal(engine._engine_tick(0, 2, 3), 0);
  if (i >= 360) linkTimes.push(performance.now() - begin);
}
const linked = sample(2, 20);
for (let i = 0; i < 20; i++)
  assert.ok(
    Math.hypot(linked[i * 6] - pendulums[i][1], linked[i * 6 + 1]) < 1.001,
  );
linkTimes.sort((a, b) => a - b);
console.log(
  `WASM 20 ropes with drag: median ${linkTimes[60].toFixed(3)} ms/tick, p95 ${linkTimes[114].toFixed(3)} ms/tick`,
);
console.log(
  "PASS moving support weight, contact stacks and loaded rope constraints",
);
// Informational benchmark, not a timing assertion dependent on the host.
for (const count of [20, 100, 200]) {
  const rows = Array.from({ length: count }, (_, i) => {
    const row = [...base];
    row[1] = (i % 20) * 0.2;
    row[2] = Math.floor(i / 20) * 0.2;
    return row;
  });
  reset(rows, 0);
  ticks(10);
  const times = [];
  for (let i = 0; i < 120; i++) {
    const begin = performance.now();
    ticks(1);
    times.push(performance.now() - begin);
  }
  times.sort((a, b) => a - b);
  console.log(
    `WASM ${count} separated bodies: median ${times[60].toFixed(3)} ms/tick, p95 ${times[114].toFixed(3)} ms/tick (240 Hz budget 4.167 ms)`,
  );
}
