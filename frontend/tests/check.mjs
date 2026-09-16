import assert from "node:assert/strict";
import { readFileSync, mkdirSync } from "node:fs";
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
mkdirSync("../engine/build", { recursive: true });
execFileSync(
  process.env.CXX || "g++",
  [
    "-std=c++17",
    "-O2",
    "../engine/src/main.cpp",
    "-o",
    "../engine/build/physics.exe",
  ],
  { windowsHide: true },
);
execFileSync("../engine/build/physics.exe", ["--test"], {
  stdio: "inherit",
  windowsHide: true,
});

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
const canvas = { width: 0, height: 0, getBoundingClientRect: () => ({ width: 800, height: 600 }), getContext: () => context };
const moving = make("rect", "moving");
moving.vx = 1;
for (const running of [false, true]) {
  labels.length = 0;
  if (running) {
    moving.derived = Array(20).fill(0);
    moving.derived[3] = 9.81;
  }
  paint(canvas, { version: 2, items: [moving] }, { x: 0, y: 0, scale: 80 }, null, false, running);
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
assert.deepEqual(indexed.items.map(o => o.index), [1, 1, 1, 2, 1, 1, 2]);
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

execFileSync(process.env.CXX || "g++", [
  "-std=c++17", "-O2", "../engine/tests/conservation.cpp", "-o", "../engine/build/conservation.exe",
], { windowsHide: true });
execFileSync("../engine/build/conservation.exe", [], { stdio: "inherit", windowsHide: true });

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
