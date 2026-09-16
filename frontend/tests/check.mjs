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
