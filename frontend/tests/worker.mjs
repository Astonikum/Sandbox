import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const moduleUrl = (source) => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64');
const source = (name) => readFileSync(new URL(`../src/${name}.ts`, import.meta.url), 'utf8');
const model = moduleUrl(source('model'));
const physics = moduleUrl(source('physics').replace('"./model"', JSON.stringify(model)));
const api = moduleUrl(source('wasm-api'));
const variables = moduleUrl(source('variables'));
const messages = [];
globalThis.self = { location: { origin: new URL('../public/', import.meta.url).href } };
globalThis.postMessage = (message) => messages.push(message);
await import(moduleUrl(source('physics.worker')
  .replaceAll('"./model"', JSON.stringify(model))
  .replaceAll('"./physics"', JSON.stringify(physics))
  .replaceAll('"./wasm-api"', JSON.stringify(api))
  .replaceAll("'./variables'", JSON.stringify(variables))
  .replaceAll('import.meta.url', JSON.stringify(new URL('../public/assets/physics.worker.js', import.meta.url).href))));
const { initial, make } = await import(model);
const { ensureVariables, bindingKey, saveVariable, bindVariable } = await import(variables);
const scene = structuredClone(initial), before = structuredClone(scene);
await self.onmessage({ data: { type: 'init', scene, mode: 'preview' } });
assert.deepEqual(scene, before, 'preview must leave editor data unchanged');
assert.deepEqual(messages.map(m => m.type), ['ready', 'frame']);
let frame = messages.at(-1);
assert.equal(frame.time, 0, 'preview does not advance the editor clock');
assert.ok(Math.abs(frame.derived[21] - 9.81) < 1e-8);
assert.ok(frame.state[10] > 0, 'preview includes velocity arising from gravity');
assert.ok(frame.derived.every(Number.isFinite));
// Preview uses the same constraints as simulation, so resting reaction and
// friction are available too, not only the special-case gravity vector.
scene.items[1].y = 1.025;
messages.length = 0;
await self.onmessage({ data: { type: 'init', scene, mode: 'preview' } });
frame = messages.at(-1);
assert.equal(frame.type, 'frame');
assert.ok(Math.abs(frame.derived[25] + 9.81) < 1e-8);
const supportForce = frame.forceSamples[1].find(f => f.category === 1);
assert.ok(supportForce && Math.abs(supportForce.point.y - .5) < .001);
assert.ok(supportForce.vector.y < 0);
assert.ok(Math.abs(frame.derived[26]) < 1e-8);
// Formula errors produce a controlled error rather than a broken frame.
const driven = make('rect', 'driven');
driven.trajectory = { x: '1/0', y: '0', angle: '0' };
messages.length = 0;
await self.onmessage({ data: { type: 'init', scene: { version: 2, items: [driven] }, mode: 'preview' } });
assert.deepEqual(messages.map(m => m.type), ['error']);
console.log('PASS actual Worker preview: computed velocity, gravity, support, friction, unchanged editor and formula error');
// A 90-degree velocity leaves a floating-point X residue. Resting contact
// must not turn the resulting subnormal impulse into Infinity/NaN.
messages.length = 0;
const playback = structuredClone(initial);
playback.items[1].vx = 2 * Math.cos(Math.PI / 2);
playback.items[1].vy = -2;
await self.onmessage({ data: { type: 'init', scene: playback, mode: 'dynamic' } });
for (let i = 0; i < 1800; i++) {
  await self.onmessage({ data: { type: 'frame', elapsed: 1 / 60, drag: null, edits: [] } });
  assert.equal(messages.at(-1).type, 'frame', JSON.stringify(messages.at(-1)));
  assert.ok(messages.at(-1).state.every(Number.isFinite));
  assert.ok(messages.at(-1).derived.every(Number.isFinite));
}
console.log('PASS actual Worker dynamic playback without dragging');
messages.length = 0;
const grabbed = make('rect', 'grabbed');
await self.onmessage({ data: { type: 'init', scene: { version: 2, items: [grabbed] }, mode: 'dynamic' } });
await self.onmessage({ data: { type: 'frame', elapsed: 1 / 60, drag: { id: 'grabbed', x: .4, y: 0, local: { x: .4, y: 0 } }, edits: [] } });
frame = messages.at(-1);
assert.ok(Math.abs(frame.state[0]) < 1e-12 && Math.abs(frame.state[2]) < 1e-12);
await self.onmessage({ data: { type: 'frame', elapsed: 1 / 60, drag: { id: 'grabbed', x: .4, y: .5, local: { x: .4, y: 0 } }, edits: [] } });
assert.ok(messages.at(-1).state[2] > 0);
console.log('PASS actual Worker drag preserves the grabbed point and rotates off center');
messages.length = 0;
const graphed = ensureVariables(structuredClone(initial));
const massId = graphed.bindings[bindingKey('2', 'mass')];
Object.assign(graphed.variables.find(v => v.id === massId), { mode: 'graph', graph: { source: 'time', points: [{ x: 0, y: 1 }, { x: 1, y: 2 }] } });
await self.onmessage({ data: { type: 'init', scene: graphed, mode: 'dynamic' } });
for (let i = 0; i < 60; i++) await self.onmessage({ data: { type: 'frame', elapsed: 1 / 60, drag: null, edits: [] } });
frame = messages.at(-1);
assert.equal(frame.type, 'frame');
assert.ok(frame.variableValues[graphed.variables.findIndex(v => v.id === massId)] > 1.9);
console.log('PASS actual Worker graph drives mass over simulation time');
messages.length = 0;
const dependent = ensureVariables(structuredClone(initial));
dependent.items.find(o => o.id === '2').vx = 1;
Object.assign(dependent.variables.find(v => v.id === dependent.bindings[bindingKey('2', 'mass')]), { mode: 'graph', graph: {
  source: dependent.bindings[bindingKey('2', 'x')],
  points: [{ x: 0, y: 1 }, { x: 1, y: 2 }],
} });
await self.onmessage({ data: { type: 'init', scene: dependent, mode: 'dynamic' } });
for (let i = 0; i < 60; i++) await self.onmessage({ data: { type: 'frame', elapsed: 1 / 60, drag: null, edits: [] } });
frame = messages.at(-1);
assert.equal(frame.type, 'frame');
assert.ok(Math.abs(frame.variableValues[dependent.variables.findIndex(v => v.id === dependent.bindings[bindingKey('2', 'mass')])] - (1 + frame.state[6])) < .05);
console.log('PASS actual Worker graph follows another live variable');
messages.length = 0;
const oriented = ensureVariables(structuredClone(initial));
const angleId = oriented.bindings[bindingKey('3', 'vector.angle')];
Object.assign(oriented.variables.find(v => v.id === angleId), { mode: 'graph', graph: { source: 'time', points: [{ x: 0, y: 270 }, { x: 1, y: 90 }] } });
await self.onmessage({ data: { type: 'init', scene: oriented, mode: 'dynamic' } });
for (let i = 0; i < 60; i++) await self.onmessage({ data: { type: 'frame', elapsed: 1 / 60, drag: null, edits: [] } });
frame = messages.at(-1);
assert.equal(frame.type, 'frame');
const yId = oriented.bindings[bindingKey('3', 'vector.y')];
assert.ok(frame.variableValues[oriented.variables.findIndex(v => v.id === angleId)] < 100);
assert.ok(frame.variableValues[oriented.variables.findIndex(v => v.id === yId)] < -9);
console.log('PASS actual Worker graph rotates acceleration by polar angle');
messages.length = 0;
let converted = saveVariable(ensureVariables(structuredClone(initial)), { symbol: 'speedKmh', value: 0, unit: 'км/ч' });
const speedId = converted.variables.find(v => v.symbol === 'speedKmh').id;
converted = bindVariable(converted, '2', 'vx', speedId);
Object.assign(converted.variables.find(v => v.id === speedId), { mode: 'graph', graph: { source: 'time', points: [{ x: 0, y: 0 }, { x: 1, y: 36 }] } });
await self.onmessage({ data: { type: 'init', scene: converted, mode: 'dynamic' } });
for (let i = 0; i < 60; i++) await self.onmessage({ data: { type: 'frame', elapsed: 1 / 60, drag: null, edits: [] } });
frame = messages.at(-1);
assert.equal(frame.type, 'frame');
assert.ok(frame.variableValues[converted.variables.findIndex(v => v.id === speedId)] > 35);
assert.ok(frame.state[9] > 9, 'worker converts km/h to m/s before applying speed');
console.log('PASS actual Worker graph converts a bound speed variable');
messages.length = 0;
const drivenLive = make('rect', 'driven-live');
drivenLive.fixed = true;
drivenLive.trajectory = { x: 't', y: '0', angle: '0' };
await self.onmessage({ data: { type: 'init', scene: { version: 2, items: [drivenLive] }, mode: 'dynamic' } });
await self.onmessage({ data: { type: 'frame', elapsed: 1 / 60, drag: null, edits: [{ id: drivenLive.id, patch: { trajectory: { x: '2*t', y: '0', angle: '0' } } }] } });
frame = messages.at(-1);
assert.equal(frame.type, 'frame');
assert.ok(Math.abs(frame.state[0] - 2 * frame.time) < 1e-10, 'live formula reaches WASM');
console.log('PASS Worker live trajectory formula patch');
messages.length = 0;
await self.onmessage({ data: { type: 'init', scene: structuredClone(initial), mode: 'dynamic' } });
await self.onmessage({ data: { type: 'frame', elapsed: 1 / 60, drag: null, edits: [{ id: '3', patch: { gravity: false } }] } });
frame = messages.at(-1);
assert.equal(frame.type, 'frame');
assert.equal(frame.derived[1 * 20 + 3], 0, 'gravity classification changes in the running Worker');
await self.onmessage({ data: { type: 'frame', elapsed: 1 / 60, drag: null, edits: [{ id: '3', patch: { gravity: true } }] } });
frame = messages.at(-1);
assert.ok(Math.abs(frame.derived[1 * 20 + 3] - 9.81) < 1e-8);
console.log('PASS Worker live gravity classification toggle');
for (const count of [200, 201]) {
  messages.length = 0;
  const items = Array.from({ length: count }, (_, i) => make('rect', `limit-${i}`, i * 2));
  await self.onmessage({ data: { type: 'init', scene: { version: 2, items }, mode: 'dynamic' } });
  assert.equal(messages.at(-1).type, count === 200 ? 'ready' : 'error');
  if (count === 201) assert.match(messages.at(-1).message, /200 тел/);
}
for (const count of [400, 401]) {
  messages.length = 0;
  const target = make('rect', 'limit-target');
  const bearing = make('bearing', 'limit-bearing');
  bearing.fixed = true;
  bearing.bindings = Array.from({ length: count }, () => ({ id: target.id, local: { x: 0, y: 0 } }));
  await self.onmessage({ data: { type: 'init', scene: { version: 2, items: [target, bearing] }, mode: 'dynamic' } });
  assert.equal(messages.at(-1).type, count === 400 ? 'ready' : 'error');
  if (count === 401) assert.match(messages.at(-1).message, /400 связей/);
}
console.log('PASS Worker input limits at 200/201 bodies and 400/401 generated links');
