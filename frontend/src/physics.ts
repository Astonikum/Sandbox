import { body, connector, geo, resolve, endpoint, local } from "./model";
import type { Scene, Vec, BodyItem, Geometry } from "./model";
export type Link = {
  id: string;
  kind: number;
  a: number;
  b: number;
  anchor: Vec;
  la: Vec;
  lb: Vec;
  length: number;
  k: number;
  damping: number;
  pulley: number;
  angle: number;
};
export function linksFor(s: Scene): Link[] {
  const bs = s.items.filter(body),
    links: Link[] = [],
    index = (b?: BodyItem) => (b ? bs.findIndex((o) => o.id === b.id) : -1);
  const point = (o: Geometry, e: 0 | 1) =>
    o.ends[e]
      ? resolve(o.ends[e]!, s.items)
      : { p: endpoint(o, e), local: { x: 0, y: 0 }, body: undefined };
  const add = (
    id: string,
    kind: number,
    a: ReturnType<typeof resolve>,
    b: ReturnType<typeof resolve>,
    length = 0,
    k = 0,
    damping = 0,
    pulley = -1,
  ) => {
    if (!a.body && !b.body) return;
    if (!a.body) [a, b] = [b, a];
    if (a.body?.id === b.body?.id) return;
    links.push({
      id,
      kind,
      a: index(a.body),
      b: index(b.body),
      anchor: b.p,
      la: a.local,
      lb: b.local,
      length,
      k,
      damping,
      pulley,
      angle: (b.body?.angle || 0) - (a.body?.angle || 0),
    });
  };
  for (const o of s.items.filter(geo)) {
    if (connector(o) && o.kind === "bearing") {
      const points = o.bindings.map((a) => resolve(a, s.items));
      if (o.fixed)
        for (const a of points)
          add(o.id, 2, a, { p: { x: o.x, y: o.y }, local: { x: 0, y: 0 } });
      else
        for (let i = 1; i < points.length; i++)
          add(o.id, 2, points[0], points[i]);
    } else if (connector(o)) {
      const a = point(o, 0),
        b = point(o, 1),
        pulley = bs.findIndex((b) => b.id === o.via);
      add(
        o.id,
        o.kind === "spring" ? 3 : pulley >= 0 && a.body && b.body ? 10 : 4,
        a,
        b,
        o.length,
        o.stiffness,
        o.damping,
        pulley,
      );
    } else if (o.kind === "rod")
      for (const e of [0, 1] as const) {
        const anchor = o.ends[e];
        if (!anchor) continue;
        const target = s.items.find((t) => t.id === anchor.id);
        if (
          target?.kind === "bearing" &&
          target.bindings.some((a) => a.id === o.id)
        )
          continue;
        const b = resolve(anchor, s.items);
        // An explicit bearing replaces the weld at this end, including when
        // it was placed after the rod had already attached to the body.
        const pivot = s.items.some((pin) => pin.kind === "bearing" &&
          pin.bindings.some((a) => a.id === o.id &&
            Math.hypot(a.local.x - local(o, endpoint(o, e)).x,
              a.local.y - local(o, endpoint(o, e)).y) <= pin.w / 2 + .001) &&
          pin.bindings.some((a) => resolve(a, s.items).body?.id === b.body?.id));
        if (pivot) continue;
        add(
          o.id,
          target?.kind === "bearing" ? 2 : 12,
          { p: endpoint(o, e), body: o, local: local(o, endpoint(o, e)) },
          b,
        );
      }
  }
  return links;
}
