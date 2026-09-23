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
const messages = [];
globalThis.self = { location: { origin: new URL('../public/', import.meta.url).href } };
globalThis.postMessage = (message) => messages.push(message);
await import(moduleUrl(source('physics.worker')
  .replaceAll('"./model"', JSON.stringify(model))
  .replaceAll('"./physics"', JSON.stringify(physics))
  .replaceAll('"./wasm-api"', JSON.stringify(api))
  .replaceAll('import.meta.env.BASE_URL', '""')));
const { initial, make } = await import(model);
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
