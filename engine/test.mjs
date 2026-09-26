import { mkdirSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = dirname(fileURLToPath(import.meta.url));
const build = resolve(root, "build");
const sources = readdirSync(resolve(root, "src"))
  .filter(name => name.endsWith(".cpp") && !["main.cpp", "wasm.cpp"].includes(name))
  .sort().map(name => resolve(root, "src", name));
mkdirSync(build, { recursive: true });
for (const suite of ["mechanics", "conservation", "rest", "runtime", "stability"]) {
  const executable = resolve(build, `${suite}.exe`);
  execFileSync(process.env.CXX || "g++", [
    "-std=c++17", "-O2", "-UNDEBUG", ...sources,
    resolve(root, "tests", `${suite}.cpp`), "-o", executable,
  ], { stdio: "inherit", windowsHide: true });
  execFileSync(executable, [], { stdio: "inherit", windowsHide: true });
}
