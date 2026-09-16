import {
  body,
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
export function paint(
  canvas: HTMLCanvasElement,
  scene: Scene,
  camera: Camera,
  selected: string | null,
  grid: boolean,
  running: boolean,
  chosenTargets: string[] = [],
  hover: string | null = null,
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
  const arrow = (origin: Vec, v: Vec, name: string, id: string, offset = 0) => {
    const mag = Math.hypot(v.x, v.y);
    if (mag < 0.002) return;
    const length = Math.min(1.7, Math.max(0.3, Math.log1p(mag) * 0.35)),
      end = {
        x: origin.x + (v.x / mag) * length,
        y: origin.y + (v.y / mag) * length,
      };
    line(origin, end);
    c.save();
    c.translate(end.x, end.y);
    c.rotate(Math.atan2(v.y, v.x));
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(-8 / z, -3 / z);
    c.lineTo(-8 / z, 3 / z);
    c.closePath();
    c.fillStyle = "#111";
    c.fill();
    c.restore();
    label(name, id, { x: end.x + 7 / z, y: end.y - (6 + offset) / z });
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
      label(o.kind === "surface" ? "s" : o.kind === "rod" ? "l" : "m", o.id, {
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
      label(o.kind === "spring" ? "k" : "l", o.id, {
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
  for (const o of scene.items.filter(effect))
    if (!o.gravity)
      for (const b of targets(o, scene.items))
        if (visible(b))
          arrow(
            b,
            o.vector,
            o.kind === "force" ? "F" : o.kind === "velocity" ? "v" : "a",
            o.id,
          );
  for (const b of scene.items.filter(body)) {
    if (!visible(b)) continue;
    arrow(b, { x: b.vx, y: b.vy }, "v", b.id, 28);
    if (b.derived) {
      const d = b.derived;
      for (const [i, name, offset] of [
        [2, "Fтяж", 0],
        [4, "N", 4],
        [6, "Fтр", 10],
        [8, "Fупр", 14],
        [10, "R", 18],
        [12, "T", 22],
      ] as const)
        arrow(b, { x: d[i], y: d[i + 1] }, name, b.id, offset);
      arrow(b, { x: d[0], y: d[1] }, "a", b.id, 34);
    } else {
      let x = 0,
        y = 0;
      for (const e of scene.items.filter(effect))
        if (e.gravity && targets(e, [b]).length) {
          x += e.vector.x * b.mass;
          y += e.vector.y * b.mass;
        }
      arrow(b, { x, y }, "Fтяж", b.id);
    }
  }
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
