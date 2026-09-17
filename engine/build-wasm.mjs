import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
const root = dirname(fileURLToPath(import.meta.url));
const out = resolve(root, "../frontend/public/engine");
const inputs = [
  "src/core.hpp",
  "src/expression.hpp",
  "src/wasm.cpp",
  "build-wasm.mjs",
];
const hash = createHash("sha256");
for (const p of inputs) hash.update(readFileSync(resolve(root, p)));
const digest = hash.digest("hex"),
  stamp = resolve(out, "build.json");
if (
  existsSync(stamp) &&
  existsSync(resolve(out, "physics.wasm")) &&
  existsSync(resolve(out, "physics.mjs")) &&
  JSON.parse(readFileSync(stamp, "utf8")).sourceHash === digest
) {
  console.log("WASM up to date");
  process.exit(0);
}
const sdk =
  process.env.EMSDK ||
  (process.platform === "win32" ? "D:/Tools/emsdk" : resolve(homedir(), ".local/share/emsdk"));
const compiler = resolve(sdk, "upstream/emscripten/em++.py");
if (!sdk || !existsSync(compiler))
  throw Error(
    "Set EMSDK to an activated Emscripten SDK (6.0.9). Prebuilt WASM can be served without the SDK.",
  );
mkdirSync(out, { recursive: true });
const python =
  process.env.EMSDK_PYTHON ||
  (process.platform === "win32"
    ? resolve(sdk, "python/3.13.3_64bit/python.exe")
    : existsSync(resolve(sdk, "python/3.13.3_64bit/bin/python3"))
      ? resolve(sdk, "python/3.13.3_64bit/bin/python3")
      : "python3");
const exports = [
  "input",
  "output",
  "formulas",
  "reset",
  "tick",
  "sample",
  "time",
  "body",
  "force",
  "link",
  "gravity",
  "trajectory",
  "gravity_vector",
  "observables",
  "relax",
].map((n) => "_engine_" + n);
execFileSync(
  python,
  [
    compiler,
    resolve(root, "src/wasm.cpp"),
    "-std=c++17",
    "-O3",
    "-fexceptions",
    "--no-entry",
    "-sMODULARIZE=1",
    "-sEXPORT_ES6=1",
    "-sENVIRONMENT=web,worker,node",
    "-sFILESYSTEM=0",
    "-sALLOW_MEMORY_GROWTH=1",
    "-sINITIAL_MEMORY=16777216",
    "-sMAXIMUM_MEMORY=134217728",
    "-sSTACK_SIZE=1048576",
    "-sEXPORTED_FUNCTIONS=" + JSON.stringify(exports),
    "-sEXPORTED_RUNTIME_METHODS=" + JSON.stringify(["HEAPF64", "HEAPU8"]),
    "-o",
    resolve(out, "physics.mjs"),
  ],
  {
    stdio: "inherit",
    windowsHide: true,
    env: { ...process.env, EM_CONFIG: resolve(sdk, ".emscripten") },
  },
);
chmodSync(resolve(out, "physics.wasm"), 0o644);
writeFileSync(
  stamp,
  JSON.stringify({ emscripten: "6.0.9", sourceHash: digest }, null, 2) + "\n",
);
console.log("Built physics.mjs + physics.wasm");
