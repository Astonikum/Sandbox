import { body, effect, targets } from "./model";
import type { BodyItem, Scene, Patch, Effect } from "./model";
import { linksFor } from "./physics";
import { FixedClock, STEP } from "./wasm-api";
import { convertUnit, fields as variableFields, readField, variableMode, writeField, valueAt } from './variables';
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
function forceSamples() {
  const count = engine._engine_force_count();
  const start = engine._engine_force_output() / 8;
  const values = engine.HEAPF64.subarray(start, start + count * 7);
  const result: NonNullable<BodyItem["forceSamples"]>[] = bodies.map(() => []);
  for (let i = 0; i < values.length; i += 7) {
    const [bodyIndex, category, x, y, fx, fy, source] = values.subarray(i, i + 7);
    result[bodyIndex].push({ source, category, point: { x, y }, vector: { x: fx, y: fy } });
  }
  return result;
}
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
    if (b.fixed && !b.trajectory) continue;
    const i = bodies.indexOf(b);
    check(engine._engine_body(i, 9, o.vector.x));
    check(engine._engine_body(i, 10, o.vector.y));
  }
}
function edit(id: string, patch: Patch) {
  const o = scene.items.find((o) => o.id === id);
  if (!o) return;
  Object.assign(o, patch);
  for (const field of variableFields(o)) {
    const variableId = scene.bindings?.[`${id}:${field.key}`];
    const variable = scene.variables?.find(v => v.id === variableId);
    if (variable && !field.computed) variable.value = convertUnit(readField(o, field.key), field.unit, variable.unit);
  }
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
function applyGraphs(time: number) {
  const variables = scene.variables;
  if (!variables?.some(v => variableMode(v) === 'graph' && v.graph)) return;
  check(engine._engine_sample(time));
  const output = engine.HEAPF64.subarray(engine._engine_output() / 8, engine._engine_output() / 8 + bodies.length * 6);
  const observables = engine.HEAPF64.subarray(engine._engine_observables() / 8, engine._engine_observables() / 8 + bodies.length * 20);
  const value = (id: string, seen = new Set<string>()): number => {
    const v = variables.find(v => v.id === id);
    if (!v) throw Error('Отсутствует переменная графика');
    if (seen.has(id)) throw Error('Цикл зависимостей графиков');
    if (variableMode(v) === 'graph' && v.graph) { seen.add(id); return valueAt(v.graph.points, v.graph.source === 'time' ? time : value(v.graph.source, seen)); }
    if (v.derived) {
      const index = bodies.findIndex(b => b.id === v.derived!.itemId);
      if (index < 0) return 0;
      const field = variableFields(bodies[index]).find(f => f.key === `derived.${v.derived!.index}`)!;
      return convertUnit(observables[index * 20 + v.derived.index], field.unit, v.unit);
    }
    const binding = Object.entries(scene.bindings || {}).find(([, bound]) => bound === id);
    if (binding) {
      const [itemId, key] = binding[0].split(':');
      const index = bodies.findIndex(b => b.id === itemId);
      const offset: Record<string, number> = { x: 0, y: 1, angle: 2, vx: 3, vy: 4, omega: 5 };
      if (index >= 0) {
        const field = variableFields(bodies[index]).find(f => f.key === key);
        if (field && key in offset) return convertUnit(output[index * 6 + offset[key]], field.unit, v.unit);
        if (field && key.startsWith('velocity.')) return convertUnit(readField({ ...bodies[index], vx: output[index * 6 + 3], vy: output[index * 6 + 4] }, key), field.unit, v.unit);
      }
    }
    return v.value;
  };
  for (const v of variables) {
    if (variableMode(v) !== 'graph' || !v.graph) continue;
    const next = value(v.id);
    if (!Number.isFinite(next) || Math.abs(next) > 1e5) throw Error(`График ${v.symbol}: значение вне диапазона`);
    if (next === v.value) continue;
    v.value = next;
    for (const [binding, id] of Object.entries(scene.bindings || {})) {
      if (id !== v.id) continue;
      const [itemId, key] = binding.split(':');
      const o = scene.items.find(o => o.id === itemId);
      if (!o) continue;
      const field = variableFields(o).find(f => f.key === key);
      const physical = field ? convertUnit(next, v.unit, field.unit) : next;
      if (field && (physical < (field.min ?? -1e5) || physical > (field.max ?? 1e5))) throw Error(`График ${v.symbol}: значение не подходит свойству`);
      const updated = writeField(o, key, physical);
      edit(itemId, effect(updated) ? { vector: updated.vector } : key.startsWith('velocity.') && body(updated) ? { vx: updated.vx, vy: updated.vy } : key === 'radius' ? { w: physical * 2, h: physical * 2 } : { [key]: physical });
    }
  }
}
async function initialize(s: Scene, mode: string) {
  const url = new URL(/* @vite-ignore */ "../engine/physics.mjs", import.meta.url).href;
  const module = await import(/* @vite-ignore */ url);
  engine = await module.default();
  scene = s;
  bodies = s.items.filter(body);
  links = linksFor(s);
  if (bodies.length > 200 || links.length > 400)
    throw Error(`Превышен лимит движка: не более 200 тел и 400 связей (сейчас ${bodies.length} тел, ${links.length} связей).`);
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
        b.trajectory ? (b.fixed ? 3 : 2) : Number(b.fixed),
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
  applyGraphs(0);
  if (mode === "preview") {
    // Probe one fixed step on this isolated worker. The editor retains its
    // original geometry, parameters, history and simulation clock.
    check(engine._engine_tick(-1, 0, 0));
    check(engine._engine_sample(engine._engine_time()));
    const state = engine.HEAPF64.slice(engine._engine_output() / 8,
      engine._engine_output() / 8 + bodies.length * 6);
    const derived = engine.HEAPF64.slice(engine._engine_observables() / 8,
      engine._engine_observables() / 8 + bodies.length * 20);
    postMessage({ type: "ready" });
    postMessage({ type: "frame", state, rendered: state, derived, forceSamples: forceSamples(),
      time: 0, cost: 0, dropped: 0, settled: true, residual: 0, variableValues: scene.variables?.map(v => v.value) },
      { transfer: [state.buffer, derived.buffer] });
    return;
  }
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
    const count = staticMode
        ? Math.min(32, 12000 - staticSteps)
        : clock.consume(data.elapsed),
      drag = data.drag ? bodies.findIndex((b) => b.id === data.drag.id) : -1;
    if (drag >= 0) check(engine._engine_drag_point(data.drag.local.x, data.drag.local.y));
    let residual = 0,
      settled = false;
    for (let i = 0; i < count; i++) {
      applyGraphs(engine._engine_time());
      effects();
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
        forceSamples: forceSamples(),
        time: t,
        cost: performance.now() - began,
        dropped: clock.dropped,
        settled,
        residual,
        variableValues: scene.variables?.map(v => v.value),
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
