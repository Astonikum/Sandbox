import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import ts from "typescript";
const url = (source) =>
  "data:text/javascript;base64," +
  Buffer.from(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
  ).toString("base64");
const modelUrl = url(
  readFileSync(new URL("../src/model.ts", import.meta.url), "utf8"),
);
const {
  initial,
  validate,
  make,
  body,
  effect,
  targets,
  rename,
  removeItem,
  attachScene,
  resolve,
  editGeometry,
  endpoint,
  indexLabel,
  itemLabel,
} = await import(modelUrl);
const { linksFor } = await import(
  url(
    readFileSync(new URL("../src/physics.ts", import.meta.url), "utf8").replace(
      /from ['"]\.\/model['"]/g,
      `from '${modelUrl}'`,
    ),
  )
);
assert.deepEqual(validate(JSON.parse(JSON.stringify(initial))), initial);
assert.deepEqual(
  initial.items.map((o) => o.kind),
  ["surface", "rect", "acceleration"],
);
assert.equal(initial.items.find(effect).scope, "all");
assert.ok(!("x" in initial.items.find(effect)));
for (const mutate of [
  (s) => {
    s.items[1].id = s.items[0].id;
  },
  (s) => {
    s.items[1].mass = -1;
  },
  (s) => {
    s.items[1].mass = 0;
  },
  (s) => {
    s.items[1].x = NaN;
  },
  (s) => {
    s.items[2].scope = "selection";
    s.items[2].targets = ["missing"];
  },
  (s) => {
    s.items[2].x = 2;
  },
  (s) => {
    s.items.push(null);
  },
]) {
  const s = structuredClone(initial);
  mutate(s);
  assert.throws(() => validate(s));
}
const newBody = make("circle", "4", 2, 0),
  all = initial.items.find(effect),
  selection = { ...all, scope: "selection", targets: ["2"] };
assert.equal(targets(all, [...initial.items, newBody]).length, 3);
assert.equal(targets(selection, [...initial.items, newBody]).length, 1);
assert.equal(removeItem(initial, "3").items.filter(effect).length, 0);
assert.ok(
  !removeItem(
    { version: 2, items: [...initial.items, { ...selection, id: "5" }] },
    "2",
  ).items.some((o) => o.id === "5"),
);
const rod = make("rod", "r", 2, 0),
  block = make("rect", "b", 0, 0);
rod.x = 1.5;
rod.ends = [{ id: "b", local: { x: 0.5, y: 0 } }, null];
let assembly = { version: 2, items: [block, rod] };
assert.equal(linksFor(validate(assembly))[0].kind, 12);
assembly = rename(assembly, "b", "new");
assert.equal(assembly.items[1].ends[0].id, "new");
assert.deepEqual(resolve(assembly.items[1].ends[0], assembly.items).p, {
  x: 0.5,
  y: 0,
});
const overlap = {
  version: 2,
  items: [make("rect", "1", 0, 0), make("rect", "2", 0, 0)],
};
assert.equal(linksFor(attachScene(overlap, "2")).length, 0);
const bearing = make("bearing", "p", 0, 0);
const pinned = attachScene(
  { version: 2, items: [...overlap.items, bearing] },
  "p",
);
assert.equal(linksFor(pinned)[0].kind, 2);
const moved = editGeometry(assembly, "new", { x: 2, y: 3, angle: Math.PI / 2 });
assert.ok(Math.abs(moved.items[1].x - 2) < 1e-12);
assert.ok(Math.abs(moved.items[1].y - 4.5) < 1e-12);
const vertical = make("rod", "v", 0, 0);
vertical.w = 0.1;
vertical.h = 2;
assert.deepEqual(endpoint(vertical, 1), { x: 0, y: 1 });
const placed = attachScene(
  { version: 2, items: [vertical, make("circle", "c", 0, 1)] },
  "c",
);
assert.equal(placed.items[0].ends[1].id, "c");
assert.equal(linksFor(placed)[0].la.y, 1);
const springA = make("spring", "s1"),
  springB = make("spring", "s2");
springA.ends[0] = { id: "s2", point: 0, local: { x: 0, y: 0 } };
springB.ends[0] = { id: "s1", point: 0, local: { x: 0, y: 0 } };
assert.throws(() => validate({ version: 2, items: [springA, springB] }));
for (const name of [
  "default",
  "lever",
  "spring-wasm",
  "atwood",
  "moving-platform",
  "static-beam",
])
  validate(
    JSON.parse(
      readFileSync(
        new URL(`../../examples/${name}.physics.json`, import.meta.url),
        "utf8",
      ),
    ),
  );
const sample = JSON.parse(
  readFileSync(
    new URL("../../examples/spring.physics.json", import.meta.url),
    "utf8",
  ),
);
const migrated = validate(sample);
assert.equal(migrated.version, 2);
assert.ok(migrated.items.filter(effect).every((o) => !("w" in o)));
assert.ok(migrated.items.filter(body).length > 0);
console.log(
  "PASS model: v2 round-trip, old-project migration, indices, zero mass, vectors without geometry, target scopes, deletion, rod weld, bearing, no body-body weld",
);
execFileSync(process.execPath, ["../engine/test.mjs"], { stdio: "inherit", windowsHide: true });

const { drawOrder, hit, paint } = await import(url(
  readFileSync(new URL("../src/render.ts", import.meta.url), "utf8")
    .replace(/from ['"]\.\/model['"]/g, `from '${modelUrl}'`),
));
const layered = [make("bearing", "bearing"), make("rod", "rod"), make("rect", "rect")];
assert.deepEqual(drawOrder(layered).map(o => o.id), ["rect", "rod", "bearing"]);
assert.equal(hit(layered, { x: 0, y: 0 }, .01).id, "bearing");
for (const kind of ["spring", "rope", "rod"]) {
  const lever = make("rod", "lever");
  const other = make(kind, "other", 0, 1);
  other.angle = Math.PI / 2;
  for (const id of ["lever", "other"]) {
    const joined = attachScene({ version: 2, items: [lever, other] }, id);
    assert.ok(joined.items.every(o => o.ends.every(a => !a)));
  }
  other.x = 1;
  assert.ok(attachScene({ version: 2, items: [lever, other] }, "other").items[1].ends[0]);
}
console.log("PASS lever endpoints, stacking and picking");

const labels = [];
const context = new Proxy({}, {
  get: (_, key) => key === "measureText" ? () => ({ width: 10 }) :
    key === "fillText" ? s => labels.push(s) : () => {},
  set: () => true,
});
globalThis.devicePixelRatio = 1;
globalThis.getComputedStyle = () => ({ getPropertyValue: () => "" });
const canvas = { width: 0, height: 0, getBoundingClientRect: () => ({ width: 800, height: 600 }), getContext: () => context };
const moving = make("rect", "moving");
moving.vx = 1;
for (const running of [false, true]) {
  labels.length = 0;
  if (running) {
    moving.derived = Array(20).fill(0);
    moving.derived[3] = 9.81;
  }
  paint(canvas, { version: 2, items: [moving] }, { x: 0, y: 0, scale: 80 }, null, false, running, [], null, true);
  assert.ok(labels.includes("v"));
  if (running) assert.ok(labels.includes("Fтяж"));
}
console.log("PASS unselected force and velocity rendering");

const { resized, handles, rotated } = await import(url(
  readFileSync(new URL("../src/render.ts", import.meta.url), "utf8")
    .replace(/from ['"]\.\/model['"]/g, `from '${modelUrl}'`),
));
const { world } = await import(modelUrl);
const nearPoint = (a, b) => assert.ok(Math.hypot(a.x-b.x, a.y-b.y) < 1e-10);
for (const angle of [0, .7, Math.PI / 2]) {
  const box = { ...make("rect", "box"), angle, w: 2, h: 2 };
  const changed = { ...box, ...resized(box, 2, world(box, { x: 2, y: -3 }), [box]) };
  nearPoint(world(box, { x: -1, y: 1 }), world(changed, { x: -changed.w/2, y: changed.h/2 }));
  assert.equal(handles(box, [box]).length, 8);
  const side = { ...box, ...resized(box, 5, world(box, { x: 3, y: 7 }), [box]) };
  assert.equal(side.h, box.h);
  nearPoint(world(box, { x: -1, y: 0 }), world(side, { x: -side.w/2, y: 0 }));
  for (const kind of ["rod", "surface"]) {
    const beam = { ...make(kind, "beam"), angle };
    assert.equal(handles(beam, [beam]).length, 2);
    const fixedEnd = endpoint(beam, 0);
    const edited = { ...beam, ...resized(beam, 1, { x: 3, y: 4 }, [beam]) };
    nearPoint(endpoint(edited, 0), fixedEnd);
    nearPoint(endpoint(edited, 1), { x: 3, y: 4 });
    if (kind === "rod") assert.equal(edited.h, .12);
    assert.deepEqual(resized(beam, 1, fixedEnd, [beam]), {});
  }
}
const turning = make("rect", "turning");
const rotation = rotated(turning, { x: 1, y: 0 }, { x: Math.cos(.31), y: Math.sin(.31) });
assert.ok(Math.abs(rotation.angle - Math.PI / 9) <= Math.PI / 36);
assert.ok(Math.abs(rotation.angle / (Math.PI / 36) - Math.round(rotation.angle / (Math.PI / 36))) < 1e-10);
console.log("PASS anchored corner/side resizing, two endpoints and 5-degree rotation");

const { numberScene, reindex } = await import(modelUrl);
const indexed = numberScene({ version: 2, items: [
  make("surface", "s"), make("rect", "a"), make("rod", "r"),
  make("circle", "b"), make("bearing", "h"), make("spring", "k"),
  make("spring", "k2"),
] });
assert.deepEqual(indexed.items.map(o => o.index), [undefined, 1, 1, 2, 1, 1, 2]);
assert.equal(indexLabel(indexed.items[0]), "");
assert.equal(itemLabel(indexed.items[0]), "Поверхность");
assert.throws(() => reindex(indexed, "s", "2"), /нет индекса/);
const legacySurface = { ...indexed.items[0], index: 42 };
const importedSurface = validate({ ...indexed, items: [legacySurface, ...indexed.items.slice(1)] });
assert.equal(importedSurface.items[0].id, "s");
assert.equal(importedSurface.items[0].w, legacySurface.w);
assert.ok(!("index" in importedSurface.items[0]));
indexed.items[2].ends[0] = { id: "a", local: { x: 0, y: 0 } };
const relabeled = reindex(indexed, "a", "3");
assert.equal(relabeled.items[1].id, "a");
assert.equal(relabeled.items[1].index, 3);
assert.equal(relabeled.items[2].ends[0].id, "a");
assert.equal(indexed.items[1].index, 1, "undo snapshot must not be mutated");
assert.deepEqual(validate(JSON.parse(JSON.stringify(relabeled))), relabeled);
assert.throws(() => reindex(indexed, "a", "2"), /категории/);
for (const bad of ["0", "-1", "1.5", "a", "9007199254740992"])
  assert.throws(() => reindex(indexed, "a", bad));
const afterDelete = numberScene({ ...indexed, items: [...removeItem(indexed, "a").items, make("rect", "new")] });
assert.equal(afterDelete.items.at(-1).index, 1);
assert.equal(afterDelete.items.find(o => o.id === "b").index, 2);
assert.deepEqual(validate({ version: 2, items: [make("rect", "old42"), make("circle", "old99"), make("rod", "old7")] }).items.map(o => o.index), [1, 2, 1]);
assert.deepEqual(numberScene({ version: 2, items: [make("rect", "missing"), { ...make("rect", "explicit"), index: 1 }] }).items.map(o => o.index), [2, 1]);
console.log("PASS category indices, stable references, rename validation, snapshots and legacy import");


// Resizing a lever must not drag the assembly attached at its unchanged end.
for (const angle of [0, .6, Math.PI / 2]) {
  const beam = { ...make("rod", "beam"), angle };
  const fixedEnd = endpoint(beam, 0), draggedEnd = endpoint(beam, 1);
  const support = make("rect", "support", fixedEnd.x, fixedEnd.y);
  beam.ends[0] = { id: support.id, local: { x: 0, y: 0 } };
  const spring = make("spring", "spring", 5, 5);
  spring.ends[0] = { id: beam.id, local: { x: -1, y: 0 } };
  spring.ends[1] = { id: beam.id, local: { x: 1, y: 0 } };
  const pin = make("bearing", "pin", fixedEnd.x, fixedEnd.y);
  pin.bindings = [{ id: beam.id, local: { x: -1, y: 0 } }];
  const before = numberScene({ version: 2, items: [beam, support, spring, pin] });
  const snapshot = structuredClone(before);
  const patch = resized(beam, 1, { x: 3, y: 2 }, before.items);
  const after = editGeometry(before, beam.id, patch);
  const edited = after.items[0];
  nearPoint(endpoint(edited, 0), fixedEnd);
  assert.deepEqual(after.items[1], before.items[1]);
  nearPoint(resolve(after.items[2].ends[0], after.items).p, fixedEnd);
  assert.equal(after.items[2].ends[1], null);
  nearPoint(endpoint(after.items[2], 1), draggedEnd);
  nearPoint(resolve(after.items[3].bindings[0], after.items).p, fixedEnd);
  assert.deepEqual(before, snapshot, "undo snapshot unchanged");
  assert.deepEqual(validate(JSON.parse(JSON.stringify(after))), after);
  assert.ok(linksFor(after).some(l => l.kind === 12));
  const released = attachScene(after, beam.id);
  nearPoint(endpoint(released.items[0], 0), fixedEnd);
  nearPoint(resolve(released.items[2].ends[0], released.items).p, fixedEnd);
  assert.equal(released.items[2].ends[1], null);
  assert.deepEqual(released.items[1], before.items[1]);
  assert.deepEqual(removeItem(after, "beam").items.find(o => o.id === "pin").bindings, []);
}
// Side resizing keeps both the support and the body's attachment point stationary.
const resizedBox = make("rect", "box");
const attachedRod = make("rod", "attached", -1.5, 0);
attachedRod.ends[1] = { id: "box", local: { x: -.5, y: 0 } };
const pairBefore = { version: 2, items: [resizedBox, attachedRod] };
const pairAfter = editGeometry(pairBefore, "box", resized(resizedBox, 5, { x: 2, y: 0 }, pairBefore.items));
nearPoint(resolve(pairAfter.items[1].ends[1], pairAfter.items).p, { x: -.5, y: 0 });
nearPoint(pairAfter.items[1], attachedRod);
console.log("PASS reshape attachments: fixed world anchors, detached ends, bearing, snapshots and round-trip");

// Shrinking away from an anchor releases it instead of leaving a phantom weld.
const pinAtEdge = make("bearing", "edgePin", .5, 0);
pinAtEdge.bindings = [{ id: "box", local: { x: .5, y: 0 } }];
const rightRod = make("rod", "rightRod", 1.5, 0);
rightRod.ends[0] = { id: "box", local: { x: .5, y: 0 } };
const shrinkBefore = { version: 2, items: [resizedBox, pinAtEdge, rightRod] };
const shrinkAfter = editGeometry(shrinkBefore, "box", resized(resizedBox, 5, { x: 0, y: 0 }, shrinkBefore.items));
assert.equal(shrinkAfter.items[2].ends[0], null);
assert.equal(shrinkAfter.items[1].bindings.length, 0);
nearPoint(shrinkAfter.items[1], pinAtEdge);
// References through a flexible connector still resolve to the same world point.
const chainSpring = make("spring", "chainSpring", -1.5, 0);
chainSpring.ends[1] = { id: "box", local: { x: -.5, y: 0 } };
const chainRope = make("rope", "chainRope");
chainRope.ends[0] = { id: "chainSpring", point: 1, local: { x: 0, y: 0 } };
const chainBefore = { version: 2, items: [resizedBox, chainSpring, chainRope] };
const chainAfter = editGeometry(chainBefore, "box", resized(resizedBox, 5, { x: 2, y: 0 }, chainBefore.items));
nearPoint(resolve(chainAfter.items[2].ends[0], chainAfter.items).p, { x: -.5, y: 0 });
validate(chainAfter);
console.log("PASS attachment release after shrink and indirect connector chains");

// Near-zero acceleration must not jump to a minimum 0.3 m arrow or blink
// at the old 0.002 cutoff. Test actual Canvas commands, not a duplicate formula.
const vectorLines = [];
let shaftStart;
const vectorContext = new Proxy({}, {
  get: (_, key) => key === "measureText" ? () => ({ width: 10 }) :
    key === "moveTo" ? (x, y) => { if (!shaftStart) shaftStart = { x, y }; } :
    key === "lineTo" ? (x, y) => vectorLines.push(vectorLines.length ? { x, y } : { x: x - shaftStart.x, y: y - shaftStart.y }) : () => {},
  set: () => true,
});
const vectorCanvas = { ...canvas, getContext: () => vectorContext };
const observedBody = make("rect", "observed");
observedBody.derived = Array(20).fill(0);
const accelerationArrow = (x) => {
  observedBody.derived[0] = x;
  vectorLines.length = 0;
  shaftStart = undefined;
  paint(vectorCanvas, { version: 2, items: [observedBody] }, { x: 0, y: 0, scale: 90 }, null, false, true);
  assert.equal(observedBody.derived[0], x, "drawing must not filter physical data");
  return vectorLines.map(p => ({ ...p }));
};
assert.equal(accelerationArrow(0).length, 0);
let previousLength = 0;
for (const magnitude of [.0001, .001, .00199, .00201, .01, 1, 10, 1e5]) {
  const positive = accelerationArrow(magnitude), negative = accelerationArrow(-magnitude);
  assert.equal(positive.length, 3);
  assert.equal(negative.length, 3);
  const length = positive[0].x;
  assert.ok(length >= previousLength - 1e-12 && length <= 1.7 + 1e-12);
  assert.ok(Math.abs(positive[1].x) <= length + 1e-12, "head cannot exceed shaft");
  assert.ok(Math.abs(length + negative[0].x) < 1e-12);
  if (magnitude <= .01) assert.ok(2 * length * 90 < 1, "small sign reversal stays below one pixel at normal zoom");
  previousLength = length;
}
const below = accelerationArrow(.00199)[0].x;
const above = accelerationArrow(.00201)[0].x;
assert.ok((above - below) * 90 < .001, "continuous around the old cutoff");
console.log("PASS continuous small-vector rendering with bounded arrowheads and unchanged physical values");

// Placing a bearing on an existing rod/body joint releases relative rotation.
const jointBody = make("rect", "jb", 0, 0);
const jointRod = make("rod", "jr", 1.5, 0);
jointRod.ends[0] = { id: jointBody.id, local: { x: .5, y: 0 } };
const jointPin = make("bearing", "jp", .5, 0);
const bearingScene = attachScene(numberScene({ version: 2, items: [jointBody, jointRod, jointPin] }), jointPin.id);
for (const scene of [bearingScene, validate(JSON.parse(JSON.stringify(bearingScene)))]) {
  const links = linksFor(scene);
  assert.equal(links.filter(l => l.kind === 12).length, 0);
  assert.equal(links.filter(l => l.kind === 2).length, 1);
}
assert.equal(linksFor(removeItem(bearingScene, jointPin.id)).filter(l => l.kind === 12).length, 1);
const ropeBody = make('rect', 'rope-body', .1, 0);
const ropeOther = make('rect', 'rope-other', 2, 0);
const ropePulley = make('pulley', 'rope-pulley', 1, 1);
const looseRope = make('rope', 'loose-rope', 0, 0);
looseRope.via = ropePulley.id;
looseRope.ends[0] = { id: ropeBody.id, local: { x: 0, y: 0 } };
const ropeItems = [ropeBody, ropeOther, ropePulley, looseRope];
assert.equal(linksFor({ version: 2, items: ropeItems })[0].kind, 4, 'one-ended rope over pulley remains unilateral');
looseRope.ends[1] = { id: ropeOther.id, local: { x: 0, y: 0 } };
assert.equal(linksFor({ version: 2, items: ropeItems })[0].kind, 10, 'two-ended rope uses pulley constraint');
labels.length = 0;
paint(canvas, initial, { x: 0, y: 0, scale: 90 }, null, false, false);
assert.ok(labels.includes("g"), "gravity acceleration is visible before simulation");
assert.ok(!labels.includes("s"), "surface has no canvas caption");
assert.ok(!labels.includes("Fтяж"), "automatic gravity force hidden before simulation");
const sampledSurface = { ...make("surface", "support"), fixed: false, mass: 1, index: 42,
  derived: Array(20).fill(0), forceSamples: [{ source: 0, category: 1, point: { x: 0, y: 0 }, vector: { x: 0, y: -1 } }] };
labels.length = 0;
paint(canvas, { version: 2, items: [sampledSurface] }, { x: 0, y: 0, scale: 90 }, null, false, true);
assert.ok(labels.includes("N"));
assert.ok(!labels.includes("s") && !labels.includes("42"), "computed surface forces have no surface number");
labels.length = 0;
paint(canvas, initial, { x: 0, y: 0, scale: 90 }, null, false, false, [], null, true);
assert.ok(labels.includes("Fтяж"), "auto-vector toggle reveals calculated gravity force");
console.log("PASS bearing overrides an existing weld, round-trip, removal and visible gravity acceleration");

const automatic = make("rect", "auto");
automatic.vx = 2;
automatic.derived = Array(20).fill(0);
automatic.derived[0] = 3;
automatic.derived[6] = 4;
automatic.forceSamples = [{ source: 0, category: 2, point: {x:0,y:.5}, vector: {x:4,y:0} }];
for (const [running, enabled, expected] of [[false, false, false], [false, true, true], [true, false, true]]) {
  labels.length = 0;
  paint(canvas, { version: 2, items: [automatic] }, { x: 0, y: 0, scale: 90 }, null, false, running, [], null, enabled);
  for (const name of ["v", "a", "Fтр"]) assert.equal(labels.includes(name), expected, name);
}
const manual = make("force", "manual");
manual.scope = "selection"; manual.targets = [automatic.id]; manual.vector = { x: 2, y: 0 };
labels.length = 0;
paint(canvas, { version: 2, items: [automatic, manual] }, { x: 0, y: 0, scale: 90 }, null, false, false);
assert.ok(labels.includes("F"));
assert.ok(!labels.includes("Fтр"));
console.log("PASS manual vectors remain visible; derived vectors require simulation or explicit toggle");

const repeated = make('rect', 'repeated');
repeated.derived = Array(20).fill(0);
repeated.derived[1] = 9.810000001;
repeated.derived[3] = 9.81;
repeated.derived[15] = 9.81;
const gravityEffect = make('acceleration', 'gravity-effect');
gravityEffect.scope = 'all'; gravityEffect.gravity = true; gravityEffect.vector = { x: 0, y: 9.81 };
labels.length = 0;
paint(canvas, { version: 2, items: [repeated, gravityEffect] }, { x: 0, y: 0, scale: 90 }, null, false, true);
assert.ok(labels.includes('g'));
assert.ok(labels.includes('Fтяж'));
assert.ok(!labels.includes('a'), 'matching body acceleration is already shown as gravity');
assert.ok(!labels.includes('FΣ'), 'resultant force stays in the variable list');
repeated.derived[1] = 8;
repeated.derived[15] = 8;
labels.length = 0;
paint(canvas, { version: 2, items: [repeated, gravityEffect] }, { x: 0, y: 0, scale: 90 }, null, false, true);
assert.ok(!labels.includes('a') && !labels.includes('FΣ'), 'duplicate acceleration visibility ignores numeric drift');
for (const delta of [9e-7, 1.1e-6, 9e-7]) {
  repeated.derived[1] = 9.81 + delta;
  labels.length = 0;
  paint(canvas, { version: 2, items: [repeated, gravityEffect] }, { x: 0, y: 0, scale: 90 }, null, false, true);
  assert.equal(labels.filter(name => name === 'a').length, 0);
}
const forceEffect = make('force', 'force-effect');
forceEffect.scope = 'selection'; forceEffect.targets = [repeated.id]; forceEffect.vector = { x: 5, y: 0 };
repeated.derived[14] = 5; repeated.derived[15] = 0;
labels.length = 0;
paint(canvas, { version: 2, items: [repeated, forceEffect] }, { x: 0, y: 0, scale: 90 }, null, false, true);
assert.ok(labels.includes('F'));
assert.ok(!labels.includes('FΣ'), 'matching resultant is already shown as applied force');
for (const delta of [9e-7, 1.1e-6, 9e-7]) {
  repeated.derived[1] = 9.81 + delta;
  labels.length = 0;
  paint(canvas, { version: 2, items: [repeated, gravityEffect, forceEffect] }, { x: 0, y: 0, scale: 90 }, null, false, true);
  assert.equal(labels.filter(name => name === 'a').length, 1);
}
console.log('PASS duplicate acceleration is suppressed and resultant force is omitted');

// Capture shaft origins without changing the renderer's physical geometry.
const origins = [];
const positionsContext = new Proxy({}, {
  get: (_, key) => key === 'measureText' ? () => ({width:10}) :
    key === 'moveTo' ? (x,y) => origins.push({x,y}) : () => {},
  set: () => true,
});
const positionsCanvas = {...canvas, getContext: () => positionsContext};
const fieldScene = structuredClone(initial);
fieldScene.items.push(make('rect', 'extra', 2, 0));
const gravityOrigin = () => {
  origins.length = 0;
  paint(positionsCanvas, fieldScene, {x:0,y:0,scale:90}, null, false, false);
  // The surface supplies one segment before g; each arrow has a shaft and head.
  return origins.at(-2);
};
const originalGravity = {...gravityOrigin()};
fieldScene.items[1].x += 4;
fieldScene.items[3].y += 4;
assert.deepEqual(gravityOrigin(), originalGravity, 'g stays fixed in world coordinates');
labels.length = 0;
paint(canvas, fieldScene, {x:0,y:0,scale:90}, null, false, false);
assert.equal(labels.filter(x=>x==='g').length, 1, 'one field marker, not one per body');
const applied = make('rect','applied',1,1);
applied.derived = Array(20).fill(0);
applied.forceSamples = [{source:0,category:1,point:{x:.2,y:.5},vector:{x:0,y:-10}}];
origins.length = 0;
paint(positionsCanvas,{version:2,items:[applied]},{x:0,y:0,scale:90},null,false,true);
assert.deepEqual(origins[0],{x:1.2,y:1.5},'reaction starts at contact');
assert.deepEqual(origins[2],{x:1.2,y:1.5},'weight acts on support at contact, not at body center');
console.log('PASS world gravity marker and physical reaction/weight application points');

// Even a crowded scene must keep force captions beside their arrow tips.
const captionLines = [], forceCaptions = [];
const captionContext = new Proxy({}, {
  get: (_, key) => key === 'measureText' ? () => ({width:10/90}) :
    key === 'lineTo' ? (x,y) => captionLines.push({x,y}) :
    key === 'fillText' ? (name,x,y) => {if(name==='F') forceCaptions.push({x,y});} : () => {},
  set: () => true,
});
const crowdedBody = make('rect','crowded');
crowdedBody.w = crowdedBody.h = 10;
const crowdedForce = make('force','crowded-force');
crowdedForce.vector = {x:10,y:0};
crowdedForce.scope = 'all';
for (const scale of [30,90,300]) {
  captionLines.length = forceCaptions.length = 0;
  paint({...canvas,getContext:()=>captionContext},{version:2,items:[crowdedBody,crowdedForce]},
    {x:0,y:0,scale},null,false,false);
  const tip = captionLines[0], caption = forceCaptions[0];
  assert.ok(Math.abs(caption.y-tip.y)*scale<=16.001,'caption cannot drift vertically');
  const edgeGap = Math.min(Math.abs(caption.x-tip.x),Math.abs(caption.x+20/90-tip.x))*scale;
  assert.ok(edgeGap<=6.001,'caption remains adjacent at every zoom');
}
console.log('PASS force captions stay beside arrow tips in crowded scenes at all zoom levels');

// A tiny motion of nearby geometry must not change a stable force caption's
// slot; a real obstruction should still make it move.
const stableCaptions = [];
const stableContext = new Proxy({}, {
  get: (_, key) => key === 'measureText' ? () => ({width:10/90}) :
    key === 'fillText' ? (name,x,y) => {
      if (name === 'F' || name === 'N') stableCaptions.push({name,x,y});
    } : () => {},
  set: () => true,
});
const stableCanvas = {...canvas, getContext: () => stableContext};
const stableBody = make('rect','stable-body');
const nearbyBody = make('rect','nearby-body',1.3919999999999,-.8);
const stableForce = make('force','stable-force');
stableForce.scope = 'selection'; stableForce.targets = [stableBody.id];
stableForce.vector = {x:5,y:0};
const stableScene = {version:2,items:[stableBody,nearbyBody,stableForce]};
const paintStable = () => {
  stableCaptions.length = 0;
  paint(stableCanvas,stableScene,{x:0,y:0,scale:90},null,false,false,[],null,true);
  return stableCaptions.map(p => ({...p}));
};
const originalCaption = paintStable()[0];
for (const x of [1.3929999999999,1.3919999999999,1.3929999999999]) {
  nearbyBody.x = x;
  const caption = paintStable()[0];
  assert.ok(Math.abs(caption.y-originalCaption.y) < 1e-12,
    'one millimeter of neighbor motion cannot move F by 36 pixels');
}
nearbyBody.x = .9; nearbyBody.y = .18;
assert.ok(Math.abs(paintStable()[0].y-originalCaption.y) > .1,
  'a body substantially covering the caption makes it relocate');

// Separate arrows and contact sources keep independent caption histories.
nearbyBody.y = -.8;
const secondForce = make('force','second-force');
secondForce.scope = 'selection'; secondForce.targets = [stableBody.id];
secondForce.vector = {x:5,y:0};
stableScene.items.push(secondForce);
const twoCaptions = paintStable().filter(p => p.name === 'F');
assert.equal(twoCaptions.length,2);
assert.notDeepEqual(twoCaptions[0],twoCaptions[1]);
nearbyBody.x += .001;
const nextCaptions = paintStable().filter(p => p.name === 'F');
assert.deepEqual(nextCaptions,twoCaptions,'neighbor motion keeps both arrow captions stable');
stableScene.items.pop();
stableBody.derived = Array(20).fill(0);
stableBody.forceSamples = [
  {source:1,category:1,point:{x:-.2,y:.5},vector:{x:0,y:-5}},
  {source:2,category:1,point:{x:.2,y:.5},vector:{x:0,y:-5}},
];
const contactCaptions = paintStable().filter(p => p.name === 'N');
assert.equal(contactCaptions.length,2);
stableBody.forceSamples[0].point.x += .001;
const movedContactCaptions = paintStable().filter(p => p.name === 'N');
assert.ok(contactCaptions.every((p,i) => Math.abs(p.y-movedContactCaptions[i].y) < .01),
  'contact captions follow small point changes without switching slots');
console.log('PASS stable vector captions across small motion, real obstruction and multiple contacts');

const bodyCaptions = [], rotations = [];
let textRotation = 0;
const bodyCaptionContext = new Proxy({}, {
  get: (_, key) => key === 'measureText' ? () => ({width:.1}) :
    key === 'save' ? () => { rotations.push(textRotation); } :
    key === 'restore' ? () => { textRotation = rotations.pop(); } :
    key === 'rotate' ? angle => { textRotation += angle; } :
    key === 'fillText' ? (name,x,y) => { if (name === 'm') bodyCaptions.push({x,y,rotation:textRotation}); } : () => {},
  set: () => true,
});
const leftBody = make('rect','label-left',0,0), rightBody = make('rect','label-right',1.25,0);
leftBody.angle = Math.PI / 3;
rightBody.angle = -Math.PI / 4;
paint({...canvas,getContext:()=>bodyCaptionContext},{version:2,items:[leftBody,rightBody]},
  {x:0,y:0,scale:90},null,false,false);
assert.equal(bodyCaptions.length,2);
assert.ok(bodyCaptions.every(p => Math.abs(p.rotation) < 1e-12),'body captions stay horizontal after rotation');
assert.ok(Math.abs(bodyCaptions[0].x-bodyCaptions[1].x) > .2 || Math.abs(bodyCaptions[0].y-bodyCaptions[1].y) > 20/90,
  'nearby body captions do not overlap');
console.log('PASS body captions stay horizontal and separate on nearby rotated bodies');

// Shared/unassigned acceleration gets one world marker; single-body stays local.
const fieldBodyA = make('rect','field-a',1,1), fieldBodyB = make('rect','field-b',2,1);
for (const [scope, targetIds, count, shared] of [
  ['all', [], 1, true], ['all', [], 2, true],
  ['selection', [], 2, true], ['selection', ['field-a','field-b'], 2, true],
  ['selection', ['field-a'], 2, false],
]) {
  const acceleration = make('acceleration','field-acceleration');
  acceleration.scope=scope; acceleration.targets=targetIds; acceleration.vector={x:0,y:3};
  const scene={version:2,items:[fieldBodyA,...(count===2?[fieldBodyB]:[]),acceleration]};
  const position=()=>{
    origins.length=0;
    paint(positionsCanvas,scene,{x:0,y:0,scale:90},null,false,false);
    assert.equal(origins.length,2,'exactly one acceleration arrow');
    return {...origins[0]};
  };
  const before=position();
  fieldBodyA.y+=.1; fieldBodyB.y+=.1;
  const after=position();
  if(shared) assert.deepEqual(after,before,'shared field independent of bodies');
  else assert.ok(Math.abs(after.y-before.y-.1)<1e-10,'single-body acceleration follows its body');
}
console.log('PASS global, group, unassigned and single-body acceleration placement');
