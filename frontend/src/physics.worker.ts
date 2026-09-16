import { body, effect, targets } from "./model";
import type { BodyItem, Scene, Patch, Effect } from "./model";
import { linksFor } from "./physics";
import { FixedClock, STEP } from "./wasm-api";
import type { WasmEngine } from "./wasm-api";
let engine: WasmEngine,
  scene: Scene,
  bodies: BodyItem[] = [],
  links: ReturnType<typeof linksFor> = [],
  staticMode = false;
const clock = new FixedClock();
let staticSteps = 0,
  settledSteps = 0;
const fields: Record<string, number> = {
  x: 1,
  y: 2,
  w: 3,
  h: 4,
  angle: 5,
  mass: 6,
  mu: 7,
  restitution: 8,
  vx: 9,
  vy: 10,
  omega: 11,
};
function check(code: number) {
  if (code)
    throw Error(
      code === 2
        ? "Ошибка формулы: проверьте синтаксис и область определения."
        : code === 3
          ? "Режим требует более 256 подшагов: уменьшите скорость или жёсткость."
          : "Недопустимое или неустойчивое состояние системы.",
    );
}
function trajectory(i: number) {
  const b = bodies[i],
    ptr = engine._engine_formulas();
  engine.HEAPU8.fill(0, ptr, ptr + 768);
  if (b.trajectory)
    for (const [j, text] of [
      b.trajectory.x,
      b.trajectory.y,
      b.trajectory.angle,
    ].entries()) {
      const bytes = new TextEncoder().encode(text);
      if (bytes.length > 255) throw Error("Формула: максимум 255 байт");
      engine.HEAPU8.set(bytes, ptr + j * 256);
    }
  check(engine._engine_trajectory(i, Number(!!b.trajectory)));
}
function effects() {
  for (const [i, b] of bodies.entries()) {
    let fx = 0,
      fy = 0,
      ax = 0,
      ay = 0,
      gx = 0,
      gy = 0;
    for (const o of scene.items.filter(effect)) {
      if (!targets(o, bodies).some((t) => t.id === b.id)) continue;
      if (o.kind === "force") {
        fx += o.vector.x;
        fy += o.vector.y;
      }
      if (o.kind === "acceleration") {
        ax += o.vector.x;
        ay += o.vector.y;
        if (o.gravity) {
          gx += o.vector.x;
          gy += o.vector.y;
        }
      }
    }
    check(engine._engine_force(i, fx, fy, ax, ay));
    check(engine._engine_gravity_vector(i, gx, gy));
  }
}
function velocity(o: Effect) {
  for (const b of targets(o, bodies)) {
    const i = bodies.indexOf(b);
    check(engine._engine_body(i, 9, o.vector.x));
    check(engine._engine_body(i, 10, o.vector.y));
  }
}
function edit(id: string, patch: Patch) {
  const o = scene.items.find((o) => o.id === id);
  if (!o) return;
  Object.assign(o, patch);
  if (body(o)) {
    const i = bodies.indexOf(o);
    for (const [key, v] of Object.entries(patch))
      if (fields[key] !== undefined && typeof v === "number")
        check(engine._engine_body(i, fields[key], v));
    if ("trajectory" in patch) trajectory(i);
  } else if (effect(o)) {
    if (o.kind === "velocity") velocity(o);
  } else
    for (const [j, l] of links.entries())
      if (l.id === id)
        check(
          engine._engine_link(
            j,
            o.kind === "bearing" ? 0 : o.length,
            o.stiffness,
            o.damping,
          ),
        );
}
async function initialize(s: Scene, mode: string) {
  const url = new URL(
    "engine/physics.mjs",
    self.location.origin + import.meta.env.BASE_URL,
  ).href;
  const module = await import(/* @vite-ignore */ url);
  engine = await module.default();
  scene = s;
  bodies = s.items.filter(body);
  links = linksFor(s);
  staticMode = mode === "static";
  if (staticMode && bodies.some((b) => b.trajectory))
    throw Error("Статика требует отключить заданные движения.");
  const start = engine._engine_input() / 8,
    mem = engine.HEAPF64,
    codes = { rect: 0, circle: 1, pulley: 5, surface: 9, rod: 10 };
  bodies.forEach((b, i) =>
    mem.set(
      [
        codes[b.kind],
        b.x,
        b.y,
        b.w,
        b.h,
        b.angle,
        b.mass,
        b.mu,
        b.restitution,
        b.vx,
        b.vy,
        b.omega,
        b.trajectory ? 2 : Number(b.fixed),
        0,
        0,
        0,
        0,
      ],
      start + i * 17,
    ),
  );
  links.forEach((l, i) =>
    mem.set(
      [
        l.kind,
        l.a,
        l.b,
        l.anchor.x,
        l.anchor.y,
        l.la.x,
        l.la.y,
        l.lb.x,
        l.lb.y,
        l.length,
        l.k,
        l.damping,
        l.pulley,
        l.angle,
        0,
        0,
      ],
      start + 200 * 17 + i * 16,
    ),
  );
  check(engine._engine_reset(bodies.length, links.length, 0));
  bodies.forEach((b, i) => {
    if (b.trajectory) trajectory(i);
  });
  for (const o of s.items) if (effect(o) && o.kind === "velocity") velocity(o);
  effects();
  postMessage({ type: "ready" });
}
self.onmessage = async ({ data }) => {
  try {
    if (data.type === "init") {
      await initialize(data.scene, data.mode);
      return;
    }
    if (data.type !== "frame" || !engine) return;
    const began = performance.now();
    for (const e of data.edits as { id: string; patch: Patch }[])
      edit(e.id, e.patch);
    effects();
    const count = staticMode
        ? Math.min(32, 12000 - staticSteps)
        : clock.consume(data.elapsed),
      drag = data.drag ? bodies.findIndex((b) => b.id === data.drag.id) : -1;
    let residual = 0,
      settled = false;
    for (let i = 0; i < count; i++) {
      check(engine._engine_tick(drag, data.drag?.x || 0, data.drag?.y || 0));
      if (staticMode) {
        residual = engine._engine_relax();
        staticSteps++;
        settledSteps = residual < 1e-4 ? settledSteps + 1 : 0;
        if (settledSteps >= 120) {
          settled = true;
          break;
        }
      }
    }
    if (staticMode && staticSteps >= 12000 && !settled)
      throw Error(
        "Статическое равновесие не найдено: проверьте опоры, нагрузки и связи.",
      );
    const t = engine._engine_time(),
      renderTime = staticMode ? t : Math.max(0, t - STEP + clock.remainder);
    check(engine._engine_sample(Math.min(t, renderTime)));
    const rendered = engine.HEAPF64.slice(
      engine._engine_output() / 8,
      engine._engine_output() / 8 + bodies.length * 6,
    );
    check(engine._engine_sample(t));
    const state = engine.HEAPF64.slice(
        engine._engine_output() / 8,
        engine._engine_output() / 8 + bodies.length * 6,
      ),
      derived = engine.HEAPF64.slice(
        engine._engine_observables() / 8,
        engine._engine_observables() / 8 + bodies.length * 20,
      );
    postMessage(
      {
        type: "frame",
        rendered,
        state,
        derived,
        time: t,
        cost: performance.now() - began,
        dropped: clock.dropped,
        settled,
        residual,
      },
      { transfer: [rendered.buffer, state.buffer, derived.buffer] },
    );
  } catch (e) {
    postMessage({
      type: "error",
      message: e instanceof Error ? e.message : String(e),
    });
  }
};
