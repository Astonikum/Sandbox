import {
  body,
  indexLabel,
  effect,
  geo,
  targets,
  center,
  endAt,
  world,
  inside,
  local,
} from "./model";
import type { Scene, Item, Geometry, Vec } from "./model";
export type Camera = { x: number; y: number; scale: number };
export function fromScreen(
  p: Vec,
  rect: { width: number; height: number },
  camera: Camera,
): Vec {
  return {
    x: camera.x + (p.x - rect.width / 2) / camera.scale,
    y: camera.y + (p.y - rect.height / 2) / camera.scale,
  };
}
export function fit(scene: Scene, width: number, height: number): Camera {
  const points = scene.items
    .filter(geo)
    .flatMap((o) =>
      ["spring", "rope"].includes(o.kind)
        ? [endAt(o, 0, scene.items), endAt(o, 1, scene.items)]
        : [-1, 1].flatMap((x) =>
            [-1, 1].map((y) =>
              world(o, { x: (x * o.w) / 2, y: (y * o.h) / 2 }),
            ),
          ),
    );
  if (!points.length) return { x: 0, y: 0, scale: 80 };
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y),
    left = Math.min(...xs),
    right = Math.max(...xs),
    top = Math.min(...ys),
    bottom = Math.max(...ys);
  return {
    x: (left + right) / 2,
    y: (top + bottom) / 2,
    scale: Math.max(
      5,
      Math.min(
        110,
        (width - 160) / Math.max(right - left, 2),
        (height - 160) / Math.max(bottom - top, 2),
      ),
    ),
  };
}
function segment(p: Vec, a: Vec, b: Vec) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    t = Math.max(
      0,
      Math.min(
        1,
        ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1),
      ),
    );
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}
// Keep picking consistent with the visible stacking order.
export function drawOrder(items: Item[]) {
  const layer = (o: Item) =>
    o.kind === "bearing" || o.kind === "pulley" ? 3 :
    o.kind === "rod" ? 2 :
    o.kind === "spring" || o.kind === "rope" ? 1 : 0;
  return [...items].sort((a, b) => layer(a) - layer(b));
}
export function hit(
  items: Item[],
  p: Vec,
  tolerance: number,
  onlyBodies = false,
) {
  return drawOrder(items).reverse().find((o) => {
    if (effect(o) || (onlyBodies && !body(o))) return false;
    if (o.kind === "spring" || o.kind === "rope" || o.kind === "surface")
      return segment(p, endAt(o, 0, items), endAt(o, 1, items)) < tolerance;
    if (o.kind === "bearing") {
      const q = center(o, items);
      return Math.hypot(p.x - q.x, p.y - q.y) < o.w / 2 + tolerance;
    }
    return inside(o, p, tolerance / 3);
  });
}
const sides: Vec[] = [
  { x: -1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: -1 }, { x: 1, y: 1 },
  { x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: 0, y: 1 },
];
export const twoEnds = (o: Geometry) => ["rod", "surface", "spring", "rope"].includes(o.kind);
export function handles(o: Geometry, items: Item[]): Vec[] {
  if (twoEnds(o)) return [endAt(o, 0, items), endAt(o, 1, items)];
  return sides.map(({ x, y }) => world(o, { x: x * o.w / 2, y: y * o.h / 2 }));
}
export function rotationHandle(o: Geometry, scale: number): Vec | null {
  return twoEnds(o) ? null : world(o, { x: o.w / 2 + 24 / scale, y: -o.h / 2 - 24 / scale });
}
export function rotated(o: Geometry, start: Vec, p: Vec) {
  const angle = o.angle + Math.atan2(p.y - o.y, p.x - o.x) - Math.atan2(start.y - o.y, start.x - o.x);
  const step = Math.PI / 36;
  return { angle: Math.round(angle / step) * step };
}
export function pulleyPath(a: Vec, b: Vec, p: Geometry) {
  const r = p.w / 2,
    va = { x: a.x - p.x, y: a.y - p.y },
    vb = { x: b.x - p.x, y: b.y - p.y },
    da = Math.hypot(va.x, va.y),
    db = Math.hypot(vb.x, vb.y);
  if (da <= r || db <= r) return null;
  const ta = Math.atan2(va.y, va.x) + Math.acos(r / da),
    tb = Math.atan2(vb.y, vb.x) - Math.acos(r / db);
  let arc = tb - ta;
  while (arc < 0) arc += Math.PI * 2;
  return {
    a: { x: p.x + r * Math.cos(ta), y: p.y + r * Math.sin(ta) },
    b: { x: p.x + r * Math.cos(tb), y: p.y + r * Math.sin(tb) },
    ta,
    arc,
    length: Math.sqrt(da * da - r * r) + Math.sqrt(db * db - r * r) + r * arc,
  };
}
const vectorOffsets = new WeakMap<HTMLCanvasElement, Map<string, Vec>>();
export function paint(
  canvas: HTMLCanvasElement,
  scene: Scene,
  camera: Camera,
  selected: string | null,
  grid: boolean,
  running: boolean,
  chosenTargets: string[] = [],
  hover: string | null = null,
  showAuto = false,
) {
  const rect = canvas.getBoundingClientRect(),
    dpr = devicePixelRatio || 1;
  const width = Math.round(rect.width * dpr),
    height = Math.round(rect.height * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const c = canvas.getContext("2d")!,
    z = camera.scale;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, rect.width, rect.height);
  c.translate(rect.width / 2 - camera.x * z, rect.height / 2 - camera.y * z);
  c.scale(z, z);
  c.lineWidth = 1.7 / z;
  c.strokeStyle = "#111";
  c.lineJoin = "round";
  const line = (a: Vec, b: Vec) => {
    c.beginPath();
    c.moveTo(a.x, a.y);
    c.lineTo(b.x, b.y);
    c.stroke();
  };
  const dot = (p: Vec, r: number, fill = "white") => {
    c.beginPath();
    c.arc(p.x, p.y, r, 0, Math.PI * 2);
    c.fillStyle = fill;
    c.fill();
    c.stroke();
  };
  const text = (s: string, p: Vec, size = 15) => {
    c.fillStyle = "#111";
    c.font = `italic ${size / z}px Georgia`;
    c.fillText(s, p.x, p.y);
  };
  const label = (name: string, id: string, p: Vec) => {
    text(name, p);
    const dx = c.measureText(name).width;
    text(id, { x: p.x + dx, y: p.y + 4 / z }, 10);
  };
  type Bounds = { x: number; y: number; w: number; h: number };
  const occupied: Bounds[] = scene.items.filter(geo).map((o) => {
    const points = ["spring", "rope"].includes(o.kind)
      ? [endAt(o, 0, scene.items), endAt(o, 1, scene.items)]
      : [{ x: -o.w / 2, y: -o.h / 2 }, { x: o.w / 2, y: -o.h / 2 },
         { x: -o.w / 2, y: o.h / 2 }, { x: o.w / 2, y: o.h / 2 }].map(p => world(o, p));
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    return { x: Math.min(...xs) - 6 / z, y: Math.min(...ys) - 6 / z,
      w: Math.max(...xs) - Math.min(...xs) + 12 / z,
      h: Math.max(...ys) - Math.min(...ys) + 12 / z };
  });
  const overlap = (a: Bounds, b: Bounds) =>
    Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const accelerations: { origin: Vec; v: Vec; name: string; id: string }[] = [];
  const previousOffsets = vectorOffsets.get(canvas);
  const nextOffsets = new Map<string, Vec>();
  vectorOffsets.set(canvas, nextOffsets);
  const arrow = (origin: Vec, v: Vec, name: string, id: string, detached = false) => {
    const mag = Math.hypot(v.x, v.y);
    if (!Number.isFinite(mag) || mag === 0) return;
    // Let small vectors approach zero continuously: a minimum shaft length
    // makes a tiny sign change look like a large physical impulse.
    const length = Math.min(1.7, Math.log1p(mag) * 0.35),
      head = Math.min(8 / z, length * 0.4),
      end = {
        x: origin.x + (v.x / mag) * length,
        y: origin.y + (v.y / mag) * length,
      };
    if (detached) {
      const dx = end.x - origin.x, dy = end.y - origin.y;
      const footprint = (p: Vec): Bounds => ({
        x: p.x + Math.min(0, dx) - 5 / z,
        y: p.y + Math.min(0, dy) - 24 / z,
        w: Math.abs(dx) + 48 / z, h: Math.abs(dy) + 32 / z,
      });
      const key = `${"id" in origin ? origin.id : ""}:${name}:${id}`;
      const previous = previousOffsets?.get(key);
      let best = previous ? { x: origin.x + previous.x / z, y: origin.y + previous.y / z } : origin;
      let score = previous ? occupied.reduce((sum, other) => sum + overlap(footprint(best), other), 0) : Infinity;
      // Search nearest free positions in screen pixels. In a completely packed
      // scene choose the least overlap rather than move the vector off-screen.
      search: for (let radius = 12; score > 0 && radius <= 240; radius += 12)
        for (let i = 0; i < 16; i++) {
          const angle = i * Math.PI / 8;
          const p = { x: origin.x + Math.cos(angle) * radius / z,
            y: origin.y + Math.sin(angle) * radius / z };
          const box = footprint(p);
          const cost = occupied.reduce((sum, other) => sum + overlap(box, other), 0);
          if (cost < score) { score = cost; best = p; }
          if (cost === 0) break search;
        }
      nextOffsets.set(key, { x: (best.x - origin.x) * z, y: (best.y - origin.y) * z });
      origin = best;
      end.x = origin.x + dx; end.y = origin.y + dy;
    }
    c.save();
    c.globalAlpha = Math.min(1, length * z / 3);
    line(origin, end);
    c.save();
    c.translate(end.x, end.y);
    c.rotate(Math.atan2(v.y, v.x));
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(-head, -head * 3 / 8);
    c.lineTo(-head, head * 3 / 8);
    c.closePath();
    c.fillStyle = "#111";
    c.fill();
    c.restore();
    // Choose a side of the tip; never push a caption away from its vector.
    c.font = `italic ${15 / z}px Georgia`;
    const nameWidth = c.measureText(name).width;
    c.font = `italic ${10 / z}px Georgia`;
    const captionWidth = nameWidth + c.measureText(id).width;
    let bestCaption = { x: end.x + 6 / z, y: end.y - 6 / z }, captionScore = Infinity;
    for (const x of [end.x + 6 / z, end.x - captionWidth - 6 / z])
      for (const y of [end.y - 6 / z, end.y + 16 / z]) {
        const box = { x, y: y - 15 / z, w: captionWidth, h: 20 / z };
        const score = occupied.reduce((sum, other) => sum + overlap(box, other), 0);
        if (score < captionScore) { captionScore = score; bestCaption = { x, y }; }
      }
    label(name, id, bestCaption);
    occupied.push({ x: bestCaption.x, y: bestCaption.y - 15 / z, w: captionWidth, h: 20 / z });
    c.restore();
  };
  if (grid) {
    c.save();
    c.strokeStyle = "#e2e2df";
    c.lineWidth = 0.6 / z;
    const step = z < 8 ? 10 ** Math.ceil(Math.log10(8 / z)) : 1,
      left = camera.x - rect.width / (2 * z),
      top = camera.y - rect.height / (2 * z);
    c.beginPath();
    for (
      let x = Math.floor(left / step) * step;
      x < left + rect.width / z;
      x += step
    ) {
      c.moveTo(x, top);
      c.lineTo(x, top + rect.height / z);
    }
    for (
      let y = Math.floor(top / step) * step;
      y < top + rect.height / z;
      y += step
    ) {
      c.moveTo(left, y);
      c.lineTo(left + rect.width / z, y);
    }
    c.stroke();
    c.restore();
  }
  const visible = (o: Geometry) =>
    Math.abs(o.x - camera.x) <
      rect.width / (2 * z) + Math.hypot(o.w, o.h) + 2 &&
    Math.abs(o.y - camera.y) < rect.height / (2 * z) + Math.hypot(o.w, o.h) + 2;
  for (const o of drawOrder(scene.items).filter(geo)) {
    if (body(o)) {
      if (!visible(o)) continue;
      c.save();
      c.translate(o.x, o.y);
      c.rotate(o.angle);
      if (o.kind === "circle" || o.kind === "pulley") {
        dot({ x: 0, y: 0 }, o.w / 2, "#cececa");
        if (o.kind === "pulley") {
          dot({ x: 0, y: 0 }, Math.max(0.002, o.w / 2 - 4 / z), "#eee");
          for (let i = 0; i < 4; i++) {
            const a = (i * Math.PI) / 2;
            line(
              { x: 0, y: 0 },
              { x: (Math.cos(a) * o.w) / 2, y: (Math.sin(a) * o.w) / 2 },
            );
          }
          dot({ x: 0, y: 0 }, 4 / z);
        }
      } else {
        c.fillStyle =
          o.kind === "surface"
            ? "white"
            : o.kind === "rod"
              ? "#171717"
              : "#cececa";
        if (o.kind !== "surface") {
          c.fillRect(-o.w / 2, -o.h / 2, o.w, o.h);
          c.strokeRect(-o.w / 2, -o.h / 2, o.w, o.h);
        }
        if (o.kind === "surface") {
          line({ x: -o.w / 2, y: -o.h / 2 }, { x: o.w / 2, y: -o.h / 2 });
          c.save();
          c.lineWidth = 1 / z;
          const spacing = Math.max(0.08, 9 / z);
          for (let x = -o.w / 2; x < o.w / 2; x += spacing)
            line({ x, y: -o.h / 2 }, { x: x - 6 / z, y: -o.h / 2 + 7 / z });
          c.restore();
        }
      }
      label(o.kind === "surface" ? "s" : o.kind === "rod" ? "l" : "m", indexLabel(o), {
        x: o.w / 2 + 10 / z,
        y: 3 / z,
      });
      c.restore();
    } else if (o.kind === "bearing") {
      const p = center(o, scene.items);
      dot(p, o.w / 2);
      dot(p, Math.min(2 / z, o.w / 4), "#111");
      if (o.fixed) {
        c.save();
        c.lineWidth = 1 / z;
        line({ x: p.x - o.w, y: p.y + o.w }, { x: p.x + o.w, y: p.y + o.w });
        for (let i = -1; i <= 1; i++)
          line(
            { x: p.x + i * o.w, y: p.y + o.w },
            { x: p.x + i * o.w - 5 / z, y: p.y + o.w + 5 / z },
          );
        c.restore();
      }
    } else {
      const a = endAt(o, 0, scene.items),
        b = endAt(o, 1, scene.items),
        dx = b.x - a.x,
        dy = b.y - a.y,
        len = Math.hypot(dx, dy),
        pulley = scene.items.find((p) => p.id === o.via && geo(p)) as
          Geometry | undefined,
        path = pulley ? pulleyPath(a, b, pulley) : null;
      if (path && o.kind === "rope") {
        line(a, path.a);
        c.beginPath();
        c.arc(pulley!.x, pulley!.y, pulley!.w / 2, path.ta, path.ta + path.arc);
        c.stroke();
        line(path.b, b);
      } else {
        c.save();
        c.translate(a.x, a.y);
        c.rotate(Math.atan2(dy, dx));
        c.beginPath();
        c.moveTo(0, 0);
        if (o.kind === "spring") {
          c.lineTo(len * 0.12, 0);
          const amp = Math.min(o.h / 2, 8 / z);
          for (let i = 0; i < 18; i++)
            c.lineTo(len * (0.15 + i * 0.04), i % 2 ? amp : -amp);
          c.lineTo(len * 0.88, 0);
        }
        c.lineTo(len, 0);
        c.stroke();
        c.restore();
      }
      dot(a, 2.5 / z);
      dot(b, 2.5 / z);
      label(o.kind === "spring" ? "k" : "l", indexLabel(o), {
        x: (a.x + b.x) / 2 + 10 / z,
        y: (a.y + b.y) / 2 - 9 / z,
      });
    }
    if (o.id === selected || chosenTargets.includes(o.id) || o.id === hover) {
      c.save();
      c.lineWidth = 1 / z;
      c.setLineDash(o.id === hover ? [2 / z, 3 / z] : [4 / z, 4 / z]);
      if (o.kind === "bearing") {
        const p = center(o, scene.items);
        c.strokeRect(
          p.x - o.w / 2 - 5 / z,
          p.y - o.w / 2 - 5 / z,
          o.w + 10 / z,
          o.w + 10 / z,
        );
      } else if (["spring", "rope"].includes(o.kind)) {
        line(endAt(o, 0, scene.items), endAt(o, 1, scene.items));
      } else {
        c.translate(o.x, o.y);
        c.rotate(o.angle);
        c.strokeRect(
          -o.w / 2 - 5 / z,
          -o.h / 2 - 5 / z,
          o.w + 10 / z,
          o.h + 10 / z,
        );
      }
      c.restore();
      if (o.id === selected && !running && !chosenTargets.length) {
        const turn = rotationHandle(o, z);
        if (turn) {
          dot(turn, 9 / z);
          text("↻", { x: turn.x - 6 / z, y: turn.y + 5 / z }, 17);
        }
        for (const p of handles(o, scene.items)) {
          c.fillStyle = "white";
          c.fillRect(p.x - 3 / z, p.y - 3 / z, 6 / z, 6 / z);
          c.strokeRect(p.x - 3 / z, p.y - 3 / z, 6 / z, 6 / z);
        }
      }
    }
  }
  let fieldIndex = 0;
  for (const o of scene.items.filter(effect)) {
    const affected = targets(o, scene.items);
    if (o.kind === "acceleration" && (o.gravity || o.scope === "all" || affected.length !== 1)) {
      // Shared and unassigned accelerations are field markers, not per-body
      // vectors. Global scope stays global even with just one body in the scene.
      const origin = { x: -fieldIndex++ * 0.8, y: -1.5 };
      dot(origin, 3 / z);
      arrow(origin, o.vector, o.gravity ? "g" : "aзад", indexLabel(o));
      continue;
    }
    for (const b of affected) {
      if (!visible(b)) continue;
      if (o.kind === "acceleration") {
        if (!b.fixed) accelerations.push({ origin: b, v: o.vector,
          name: "aзад", id: indexLabel(o) });
      } else if (o.kind === "force" || !running)
        arrow(b, o.vector, o.kind === "force" ? "F" : "v", indexLabel(o));
    }
  }
  for (const b of scene.items.filter(body)) {
    if (!visible(b) || !(running || showAuto)) continue;
    if (running || !scene.items.some(o => effect(o) && o.kind === "velocity" && targets(o, [b]).length))
      arrow(b, { x: b.vx, y: b.vy }, "v", indexLabel(b));
    if (b.derived) {
      const d = b.derived;
      arrow(b, { x: d[2], y: d[3] }, "Fтяж", indexLabel(b));
      arrow(b, { x: d[14], y: d[15] }, "FΣ", indexLabel(b));
      const names = ["", "N", "Fтр", "Fупр", "R", "T"];
      for (const f of b.forceSamples || []) {
        // The load on a fixed surface is already shown as P from its body.
        if (b.kind === "surface" && b.fixed) continue;
        const point = world(b, f.point);
        arrow(point, f.vector, names[f.category], indexLabel(b));
      }
      // Weight is exerted ON the support/suspension, opposite to its reaction.
      // Combine normal and friction for the same contact application point.
      const supports = new Map<number, { point: Vec; vector: Vec }>();
      for (const f of b.forceSamples || []) {
        if (b.fixed || b.trajectory) continue;
        const key = f.source;
        const total = supports.get(key) || { point: f.point, vector: { x: 0, y: 0 } };
        total.vector.x -= f.vector.x; total.vector.y -= f.vector.y;
        supports.set(key, total);
      }
      for (const f of supports.values())
        arrow(world(b, f.point), f.vector, "P", indexLabel(b));
      accelerations.push({ origin: b, v: { x: d[0], y: d[1] }, name: "a", id: indexLabel(b) });
    } else {
      let x = 0,
        y = 0;
      for (const e of scene.items.filter(effect))
        if (e.gravity && targets(e, [b]).length) {
          x += e.vector.x * b.mass;
          y += e.vector.y * b.mass;
        }
      arrow(b, { x, y }, "Fтяж", indexLabel(b));
    }
  }
  for (const a of accelerations) arrow(a.origin, a.v, a.name, a.id, true);
}
export function resized(
  o: Geometry,
  handle: number,
  p: Vec,
  items: Item[],
): Partial<Geometry> {
  if (twoEnds(o)) {
    const a = handle === 0 ? p : endAt(o, 0, items),
      b = handle === 1 ? p : endAt(o, 1, items),
      length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < (o.kind === "rod" ? 0.12 : 0.01)) return {};
    const angle = Math.atan2(b.y - a.y, b.x - a.x),
      h = o.kind === "rod" ? 0.12 : o.h,
      offset = o.kind === "surface" ? h / 2 : 0;
    return {
      x: (a.x + b.x) / 2 - Math.sin(angle) * offset,
      y: (a.y + b.y) / 2 + Math.cos(angle) * offset,
      w: length, h, angle,
      ends: o.ends.map((a, i) => (i === handle ? null : a)) as Geometry["ends"],
    };
  }
  const side = sides[handle], q = local(o, p),
    anchor = { x: -side.x * o.w / 2, y: -side.y * o.h / 2 },
    round = ["circle", "pulley", "bearing"].includes(o.kind);
  let w = side.x ? Math.max(0.01, side.x * (q.x - anchor.x)) : o.w,
    h = side.y ? Math.max(0.01, side.y * (q.y - anchor.y)) : o.h;
  if (round) w = h = side.x && side.y ? Math.max(w, h) : side.x ? w : h;
  const center = world(o, {
    x: side.x ? anchor.x + side.x * w / 2 : 0,
    y: side.y ? anchor.y + side.y * h / 2 : 0,
  });
  return { ...center, w, h };
}
