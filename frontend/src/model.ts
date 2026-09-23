export const kinds = [
  "rect",
  "circle",
  "bearing",
  "spring",
  "rope",
  "pulley",
  "force",
  "acceleration",
  "velocity",
  "surface",
  "rod",
] as const;
export type Kind = (typeof kinds)[number];
export type BodyKind = "rect" | "circle" | "surface" | "pulley" | "rod";
export type EffectKind = "force" | "velocity" | "acceleration";
export type Vec = { x: number; y: number };
export type Attachment = { id: string; point?: 0 | 1; local: Vec };
export type Geometry = {
  id: string;
  index?: number;
  kind: Exclude<Kind, EffectKind>;
  x: number;
  y: number;
  w: number;
  h: number;
  angle: number;
  fixed: boolean;
  ends: [Attachment | null, Attachment | null];
};
export type BodyItem = Geometry & {
  kind: BodyKind;
  mass: number;
  mu: number;
  restitution: number;
  vx: number;
  vy: number;
  omega: number;
  trajectory?: { x: string; y: string; angle: string };
  derived?: number[];
  forceSamples?: { source: number; category: number; point: Vec; vector: Vec }[];
};
export type Connector = Geometry & {
  kind: "spring" | "rope" | "bearing";
  length: number;
  stiffness: number;
  damping: number;
  via?: string;
  bindings: Attachment[];
};
export type Effect = {
  id: string;
  index?: number;
  kind: EffectKind;
  vector: Vec;
  scope: "selection" | "all";
  targets: string[];
  gravity?: boolean;
};
export type Item = BodyItem | Connector | Effect;
export type Patch = Record<string, unknown>;
export type Scene = { version: 2; items: Item[] };
export const names: Record<Kind, string> = {
  rect: "Тело",
  circle: "Тело (круг)",
  surface: "Поверхность",
  rod: "Рычаг",
  bearing: "Подшипник",
  pulley: "Блок",
  spring: "Пружина",
  rope: "Нить",
  force: "Сила",
  velocity: "Скорость",
  acceleration: "Ускорение",
};
export function effect(o: Item): o is Effect {
  return ["force", "velocity", "acceleration"].includes(o.kind);
}
export function body(o: Item): o is BodyItem {
  return ["rect", "circle", "surface", "pulley", "rod"].includes(o.kind);
}
export function connector(o: Item): o is Connector {
  return !body(o) && !effect(o);
}
export const geo = (o: Item): o is BodyItem | Connector => !effect(o);
export const targets = (e: Effect, items: Item[]) =>
  items
    .filter(body)
    .filter((b) => e.scope === "all" || e.targets.includes(b.id));
export const nextId = (items: Item[]) => {
  let n = 1;
  while (items.some((o) => o.id === String(n))) n++;
  return String(n);
};
export const indexGroup = (o: Item) => o.kind === "circle" ? "rect" : o.kind;
export const indexLabel = (o: Item) => String(o.index ?? o.id);
// IDs remain stable references; indices are labels unique only within a category.
export function numberScene(s: Scene): Scene {
  const used = new Map<Kind, Set<number>>();
  for (const o of s.items) {
    const group = indexGroup(o);
    if (!used.has(group)) used.set(group, new Set());
    if (o.index === undefined) continue;
    if (!Number.isSafeInteger(o.index) || o.index < 1 || used.get(group)!.has(o.index))
      throw Error("Индекс должен быть положительным целым и уникальным в своей категории");
    used.get(group)!.add(o.index);
  }
  return { ...s, items: s.items.map((o) => {
    if (o.index !== undefined) return o;
    const group = used.get(indexGroup(o))!;
    let index = 1;
    while (group.has(index)) index++;
    group.add(index);
    return { ...o, index };
  }) };
}
export function reindex(s: Scene, id: string, value: string): Scene {
  if (!/^[1-9][0-9]*$/.test(value)) throw Error("Индекс — целое число от 1");
  return numberScene({ ...s, items: s.items.map(o => o.id === id ? { ...o, index: Number(value) } : o) });
}
export function make(kind: Kind, id: string, x = 0, y = 0): Item {
  if (["force", "velocity", "acceleration"].includes(kind))
    return {
      id,
      kind: kind as EffectKind,
      vector: { x: 1, y: 0 },
      scope: "selection",
      targets: [],
    };
  const g: Geometry = {
    id,
    kind: kind as Geometry["kind"],
    x,
    y,
    w:
      kind === "surface"
        ? 4
        : kind === "rod"
          ? 2
          : kind === "spring" || kind === "rope"
            ? 2
            : 1,
    h:
      kind === "surface"
        ? 0.15
        : kind === "rod"
          ? 0.12
          : kind === "spring" || kind === "rope"
            ? 0.2
            : 1,
    angle: 0,
    fixed: kind === "surface" || kind === "pulley",
    ends: [null, null],
  };
  if (["rect", "circle", "surface", "pulley", "rod"].includes(kind))
    return {
      ...g,
      kind: kind as BodyKind,
      mass: kind === "surface" ? 0 : 1,
      mu: 0.3,
      restitution: 0,
      vx: 0,
      vy: 0,
      omega: 0,
    };
  return {
    ...g,
    kind: kind as Connector["kind"],
    w: kind === "bearing" ? 0.16 : g.w,
    h: kind === "bearing" ? 0.16 : g.h,
    length: 2,
    stiffness: 30,
    damping: 0.5,
    bindings: [],
  };
}
export const initial: Scene = numberScene({
  version: 2,
  items: [
    make("surface", "1", 0, 1.6),
    make("rect", "2", 0, 0),
    {
      id: "3",
      kind: "acceleration",
      vector: { x: 0, y: 9.81 },
      scope: "all",
      targets: [],
      gravity: true,
    },
  ],
});
export const rotate = (p: Vec, a: number): Vec => ({
  x: p.x * Math.cos(a) - p.y * Math.sin(a),
  y: p.x * Math.sin(a) + p.y * Math.cos(a),
});
export const local = (o: Geometry, p: Vec) =>
  rotate({ x: p.x - o.x, y: p.y - o.y }, -o.angle);
export const world = (o: Geometry, p: Vec) => {
  const q = rotate(p, o.angle);
  return { x: o.x + q.x, y: o.y + q.y };
};
export function inside(o: Geometry, p: Vec, pad = 0) {
  const q = local(o, p);
  return ["circle", "pulley", "bearing"].includes(o.kind)
    ? Math.hypot(q.x, q.y) <= o.w / 2 + pad
    : Math.abs(q.x) <= o.w / 2 + pad && Math.abs(q.y) <= o.h / 2 + pad;
}
export function endpoint(o: Geometry, end: 0 | 1): Vec {
  return world(
    o,
    o.kind === "rod" && o.h > o.w
      ? { x: 0, y: ((end ? 1 : -1) * o.h) / 2 }
      : { x: ((end ? 1 : -1) * o.w) / 2, y: o.kind === "surface" ? -o.h / 2 : 0 },
  );
}
export function resolve(
  a: Attachment,
  items: Item[],
  seen = new Set<string>(),
): { p: Vec; body?: BodyItem; local: Vec } {
  const o = items.find((o) => o.id === a.id);
  if (!o || effect(o)) throw Error("Соединение с отсутствующим объектом");
  if (body(o)) return { p: world(o, a.local), body: o, local: a.local };
  const key = o.id + ":" + (a.point ?? "c");
  if (seen.has(key)) throw Error("Замкнутая цепочка без тела");
  seen.add(key);
  if (o.kind === "bearing") {
    if (o.bindings.length && !o.fixed)
      return resolve(o.bindings[0], items, seen);
    return { p: { x: o.x, y: o.y }, local: { x: 0, y: 0 } };
  }
  if (a.point !== undefined) {
    const next = o.ends[a.point];
    if (next) return resolve(next, items, seen);
    return { p: endpoint(o, a.point), local: { x: 0, y: 0 } };
  }
  return { p: world(o, a.local), local: a.local };
}
export function endAt(o: Geometry, end: 0 | 1, items: Item[]) {
  if (o.kind === "rod") return endpoint(o, end);
  return o.ends[end] ? resolve(o.ends[end]!, items).p : endpoint(o, end);
}
export function center(o: Geometry, items: Item[]) {
  return o.kind === "bearing" && (o as Connector).bindings.length && !o.fixed
    ? resolve((o as Connector).bindings[0], items).p
    : { x: o.x, y: o.y };
}
// In the editor a welded assembly moves as one, preserving local attachment points.
export function editGeometry(s: Scene, id: string, patch: Patch): Scene {
  const original = s.items.find((o) => o.id === id);
  if (!original || !geo(original)) return s;
  // Reshaping is not a rigid transform of the welded assembly. Keep other
  // objects and surviving anchors at their world positions in the editor.
  if (body(original) && ("w" in patch || "h" in patch)) {
    const changed = { ...original, ...patch } as BodyItem;
    const remap = (a: Attachment | null, bearing = false): Attachment | null => {
      if (!a || a.id !== id) return a;
      const p = world(original, a.local);
      const stays = changed.kind === "rod" && !bearing
        ? ([0, 1] as const).some(e => {
            const q = endpoint(changed, e);
            return Math.hypot(p.x - q.x, p.y - q.y) < 1e-8;
          })
        : inside(changed, p, 1e-8);
      return stays ? { ...a, local: local(changed, p) } : null;
    };
    return { ...s, items: s.items.map(o => {
      if (effect(o)) return o;
      if (o.id === id) {
        if (changed.kind !== "rod") return changed;
        return { ...changed, ends: changed.ends.map((a, e) => {
          if (!a) return null;
          const p = endpoint(changed, e as 0 | 1), q = resolve(a, s.items).p;
          return Math.hypot(p.x - q.x, p.y - q.y) < 1e-8 ? a : null;
        }) as Geometry["ends"] };
      }
      const ends = o.ends.map(a => remap(a)) as Geometry["ends"];
      if (!connector(o)) return { ...o, ends };
      const bindings = o.bindings.map(a => remap(a, true)).filter((a): a is Attachment => !!a);
      // A bearing with no remaining bindings stays where it was displayed.
      const p = center(o, s.items);
      const next = { ...o, ...p, ends, bindings };
      // A detached flexible end must not jump back to its stale stored pose.
      if (o.kind === "spring" || o.kind === "rope") {
        const a = endAt(o, 0, s.items), b = endAt(o, 1, s.items);
        next.x = (a.x + b.x) / 2;
        next.y = (a.y + b.y) / 2;
        next.w = Math.max(.001, Math.hypot(b.x - a.x, b.y - a.y));
        next.angle = Math.atan2(b.y - a.y, b.x - a.x);
      }
      return next;
    }) };
  }
  const changed = { ...original, ...patch } as Geometry,
    delta = changed.angle - original.angle,
    joined = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const rod of s.items.filter((o): o is BodyItem => o.kind === "rod"))
      for (const a of rod.ends) {
        if (!a || s.items.find((o) => o.id === a.id)?.kind === "bearing")
          continue;
        const other = resolve(a, s.items).body;
        if (!other) continue;
        if (joined.has(rod.id) !== joined.has(other.id)) {
          joined.add(rod.id);
          joined.add(other.id);
          grew = true;
        }
      }
  }
  return {
    version: 2,
    items: s.items.map((o) => {
      if (o.id === id) return { ...o, ...patch } as Item;
      if (!geo(o) || !joined.has(o.id)) return o;
      const offset = rotate(
        { x: o.x - original.x, y: o.y - original.y },
        delta,
      );
      return {
        ...o,
        x: changed.x + offset.x,
        y: changed.y + offset.y,
        angle: o.angle + delta,
      };
    }),
  };
}
export function attachScene(s: Scene, id: string, tolerance = 0.15): Scene {
  const items = structuredClone(s.items),
    o = items.find((b) => b.id === id);
  if (!o || effect(o)) return s;
  try {
    if (["rod", "spring", "rope"].includes(o.kind))
      for (const end of [0, 1] as const) {
        const p = endpoint(o, end);
        let best: Attachment | null = null,
          distance = tolerance;
        for (const other of items.filter(geo)) {
          if (other.id === id) continue;
          if (other.kind === "bearing") {
            const q = center(other, items),
              d = Math.hypot(p.x - q.x, p.y - q.y);
            if (d < distance) {
              distance = d;
              best = { id: other.id, local: { x: 0, y: 0 } };
            }
          } else if (["spring", "rope", "rod"].includes(other.kind)) {
            for (const e of [0, 1] as const) {
              const q = endAt(other, e, items),
                d = Math.hypot(p.x - q.x, p.y - q.y);
              if (d < distance) {
                distance = d;
                best = {
                  id: other.id,
                  point: body(other) ? undefined : e,
                  local: body(other) ? local(other, q) : { x: 0, y: 0 },
                };
              }
            }
          }
        }
        if (!best)
          for (const other of [...items].reverse().filter(body))
            if (other.id !== id && other.kind !== "rod" && inside(other, p, tolerance / 3)) {
              best = { id: other.id, local: local(other, p) };
              break;
            }
        o.ends[end] = o.ends[end] || best;
      }
    if (["spring", "rope"].includes(o.kind) && o.ends.some(Boolean)) {
      const a = o.ends[0] ? resolve(o.ends[0], items).p : endpoint(o, 0),
        b = o.ends[1] ? resolve(o.ends[1], items).p : endpoint(o, 1);
      o.x = (a.x + b.x) / 2;
      o.y = (a.y + b.y) / 2;
      o.w = Math.max(0.001, Math.hypot(b.x - a.x, b.y - a.y));
      o.angle = Math.atan2(b.y - a.y, b.x - a.x);
    }
    // Attachment is symmetric: placing a body over a free connector end also joins it.
    if (body(o) || o.kind === "bearing")
      for (const other of items.filter(geo)) {
        if (other.id === id || !["rod", "spring", "rope"].includes(other.kind))
          continue;
        for (const end of [0, 1] as const) {
          if (other.ends[end]) continue;
          const p = endpoint(other, end);
          if (
            o.kind === "bearing"
              ? Math.hypot(p.x - center(o, items).x, p.y - center(o, items).y) <
                tolerance
              : o.kind === "rod"
                ? ([0, 1] as const).some((e) => {
                    const q = endpoint(o, e);
                    return Math.hypot(p.x - q.x, p.y - q.y) < tolerance;
                  })
                : inside(o, p, tolerance / 3)
          ) {
            other.ends[end] = {
              id,
              local: o.kind === "bearing" ? { x: 0, y: 0 } : local(o, p),
            };
          }
        }
      }
    for (const b of items.filter((o): o is Connector => o.kind === "bearing")) {
      if (b.id === id)
        b.bindings = items
          .filter(body)
          .filter((o) => inside(o, b))
          .map((o) => ({ id: o.id, local: local(o, b) }));
      else if (body(o) && inside(o, b) && !b.bindings.some((a) => a.id === id))
        b.bindings.push({ id, local: local(o, b) });
    }
    // Reject cycles rather than leave an impossible massless connection graph.
    for (const a of items
      .filter(geo)
      .flatMap((o) => o.ends)
      .filter((a): a is Attachment => !!a))
      resolve(a, items);
    return { version: 2, items };
  } catch {
    return s;
  }
}
export function removeItem(s: Scene, id: string): Scene {
  const items = s.items
    .filter((o) => o.id !== id)
    .map((o) => {
      if (effect(o))
        return { ...o, targets: o.targets.filter((t) => t !== id) };
      const ends = o.ends.map((a) =>
        a?.id === id ? null : a,
      ) as Geometry["ends"];
      return connector(o)
        ? {
            ...o,
            ends,
            bindings: o.bindings.filter((a) => a.id !== id),
            via: o.via === id ? undefined : o.via,
          }
        : { ...o, ends };
    });
  return {
    version: 2,
    items: items.filter(
      (o) => !effect(o) || o.scope === "all" || o.targets.length > 0,
    ),
  };
}
export function rename(s: Scene, id: string, to: string): Scene {
  if (
    !/^[a-zA-Zа-яА-Я0-9]+$/.test(to) ||
    s.items.some((o) => o.id === to && o.id !== id)
  )
    throw Error("Индекс должен быть уникальным: буквы или цифры");
  const ref = (a: Attachment | null) =>
    a ? { ...a, id: a.id === id ? to : a.id } : null;
  return {
    version: 2,
    items: s.items.map((o) =>
      effect(o)
        ? {
            ...o,
            id: o.id === id ? to : o.id,
            targets: o.targets.map((t) => (t === id ? to : t)),
          }
        : connector(o)
          ? {
              ...o,
              id: o.id === id ? to : o.id,
              ends: o.ends.map(ref) as Geometry["ends"],
              bindings: o.bindings.map((a) => ref(a)!),
              via: o.via === id ? to : o.via,
            }
          : {
              ...o,
              id: o.id === id ? to : o.id,
              ends: o.ends.map(ref) as Geometry["ends"],
            },
    ),
  };
}
const num = (n: unknown) =>
  typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 1e5;
const vec = (p: unknown): p is Vec =>
  !!p && num((p as Vec).x) && num((p as Vec).y);
function migrate(s: Record<string, unknown>): Scene {
  if (!Array.isArray(s.items) || !num(s.gravity))
    throw Error("Повреждён старый проект");
  const oldItems = s.items;
  const items: Item[] = oldItems.map((o) => {
    if (!o || typeof o.id !== "string" || !kinds.includes(o.kind))
      throw Error("Повреждён объект");
    if (["force", "velocity", "acceleration"].includes(o.kind)) {
      const n = Math.hypot(o.w, o.h);
      return {
        id: o.id,
        kind: o.kind,
        vector: {
          x: o.value * (n ? o.w / n : 1),
          y: o.value * (n ? o.h / n : 0),
        },
        scope: "selection",
        targets: o.targets || [],
      } as Effect;
    }
    const fresh = make(o.kind, o.id, o.x, o.y);
    if (effect(fresh)) throw Error("Неверный тип");
    Object.assign(fresh, {
      x: o.x,
      y: o.y,
      w: o.w,
      h: o.h,
      angle: o.angle,
      fixed: o.fixed,
    });
    if (body(fresh))
      Object.assign(fresh, {
        mass: o.mass,
        mu: o.mu,
        restitution: o.restitution,
        vx: o.vx,
        vy: o.vy,
        omega: o.omega,
        ...(o.trajectory ? { trajectory: o.trajectory } : {}),
      });
    else {
      fresh.length = o.length;
      fresh.stiffness = o.value;
      fresh.damping = o.damping;
      if (o.via) fresh.via = o.via;
      fresh.ends = [
        o.targets?.[0] ? { id: o.targets[0], local: { x: 0, y: 0 } } : null,
        o.targets?.[1] ? { id: o.targets[1], local: { x: 0, y: 0 } } : null,
      ];
      if (o.kind !== "bearing") {
        const a = oldItems.find((b) => b.id === o.targets?.[0]) || {
            x: o.x + o.w,
            y: o.y + o.h,
          },
          b = oldItems.find((b) => b.id === o.targets?.[1]) || {
            x: o.x,
            y: o.y,
          };
        fresh.x = (a.x + b.x) / 2;
        fresh.y = (a.y + b.y) / 2;
        fresh.w = Math.max(0.001, Math.hypot(a.x - b.x, a.y - b.y));
        fresh.h = 0.02;
        fresh.angle = Math.atan2(b.y - a.y, b.x - a.x);
      }
      if (o.kind === "bearing") fresh.bindings = [];
    }
    return fresh;
  });
  if (s.gravity !== 0)
    items.push({
      id: nextId(items),
      kind: "acceleration",
      vector: { x: 0, y: s.gravity as number },
      scope: "all",
      targets: [],
      gravity: true,
    });
  let out: Scene = { version: 2, items };
  for (const b of items.filter((o) => o.kind === "bearing"))
    out = attachScene(out, b.id);
  return out;
}
export function validate(value: unknown): Scene {
  let s = value as Scene;
  if (!s || !Array.isArray(s.items)) throw Error("Неверный формат проекта");
  if ((s as { version: number }).version === 1)
    s = migrate(s as unknown as Record<string, unknown>);
  if (s.version !== 2 || s.items.length > 200)
    throw Error("Нужна версия 2, не более 200 объектов");
  const ids = new Set<string>();
  for (const o of s.items) {
    if (
      !o ||
      !kinds.includes(o.kind) ||
      typeof o.id !== "string" ||
      !o.id ||
      !/^[a-zA-Zа-яА-Я0-9]+$/.test(o.id) ||
      ids.has(o.id)
    )
      throw Error("Некорректные индексы");
    ids.add(o.id);
    if (effect(o)) {
      if (
        !vec(o.vector) ||
        !["selection", "all"].includes(o.scope) ||
        !Array.isArray(o.targets) ||
        (o.scope === "selection" && !o.targets.length) ||
        new Set(o.targets).size !== o.targets.length
      )
        throw Error("Воздействие требует тела и корректного вектора");
      for (const k of ["x", "y", "w", "h", "angle"])
        if (k in o) throw Error("У воздействия не может быть геометрии");
      if (o.gravity !== undefined && typeof o.gravity !== "boolean")
        throw Error("Некорректное ускорение");
      continue;
    }
    if (
      !["x", "y", "w", "h", "angle"].every((k) =>
        num(o[k as keyof Geometry]),
      ) ||
      o.w < 0.001 ||
      o.h < 0.001 ||
      typeof o.fixed !== "boolean" ||
      !Array.isArray(o.ends) ||
      o.ends.length !== 2
    )
      throw Error("Неверная геометрия");
    if (body(o)) {
      if (
        !["mass", "mu", "restitution", "vx", "vy", "omega"].every((k) =>
          num(o[k as keyof BodyItem]),
        ) ||
        o.mass < 0 ||
        (!o.fixed && !o.trajectory && o.mass === 0) ||
        o.mu < 0 ||
        o.restitution < 0 ||
        o.restitution > 1
      )
        throw Error(
          "Свободному телу нужна положительная масса; μ ≥ 0, e от 0 до 1",
        );
      if (
        o.trajectory &&
        !["x", "y", "angle"].every(
          (k) =>
            typeof o.trajectory![k as "x" | "y" | "angle"] === "string" &&
            o.trajectory![k as "x" | "y" | "angle"].length > 0 &&
            o.trajectory![k as "x" | "y" | "angle"].length <= 255,
        )
      )
        throw Error("Неверная траектория");
    } else if (
      !num(o.length) ||
      o.length <= 0 ||
      !num(o.stiffness) ||
      o.stiffness < 0 ||
      !num(o.damping) ||
      o.damping < 0 ||
      !Array.isArray(o.bindings)
    )
      throw Error("Неверные параметры связи");
  }
  for (const o of s.items) {
    if (effect(o)) {
      if (o.targets.some((id) => !s.items.some((b) => body(b) && b.id === id)))
        throw Error("Отсутствует тело воздействия");
      continue;
    }
    for (const a of [...o.ends, ...(connector(o) ? o.bindings : [])])
      if (a) {
        if (
          typeof a.id !== "string" ||
          !ids.has(a.id) ||
          a.id === o.id ||
          !vec(a.local) ||
          (a.point !== undefined && a.point !== 0 && a.point !== 1)
        )
          throw Error("Некорректное крепление");
        resolve(a, s.items);
      }
    if (
      connector(o) &&
      o.via &&
      !s.items.some((b) => b.id === o.via && b.kind === "pulley")
    )
      throw Error("Отсутствует блок");
  }
  return JSON.parse(
    JSON.stringify(numberScene(s), (key, v) => (key === "derived" || key === "forceSamples" ? undefined : v)),
  );
}
