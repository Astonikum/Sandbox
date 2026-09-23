import { useEffect, useRef, useState } from "react";
import type { PointerEvent as PE, ReactNode } from "react";
import { FolderOpenIcon } from "@phosphor-icons/react/dist/csr/FolderOpen";
import { DownloadSimpleIcon } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react/dist/csr/ArrowCounterClockwise";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/dist/csr/ArrowClockwise";
import { FlowArrowIcon } from "@phosphor-icons/react/dist/csr/FlowArrow";
import { GridFourIcon } from "@phosphor-icons/react/dist/csr/GridFour";
import { CrosshairSimpleIcon } from "@phosphor-icons/react/dist/csr/CrosshairSimple";
import { PlayIcon } from "@phosphor-icons/react/dist/csr/Play";
import { StopIcon } from "@phosphor-icons/react/dist/csr/Stop";
import { ScalesIcon } from "@phosphor-icons/react/dist/csr/Scales";
import { TrashIcon } from "@phosphor-icons/react/dist/csr/Trash";
import { FileIcon } from "@phosphor-icons/react/dist/csr/File";
import { CheckIcon } from "@phosphor-icons/react/dist/csr/Check";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { LockSimpleIcon } from "@phosphor-icons/react/dist/csr/LockSimple";
import { CircleNotchIcon } from "@phosphor-icons/react/dist/csr/CircleNotch";
import {
  body,
  effect,
  connector,
  geo,
  kinds,
  names,
  initial,
  make,
  nextId,
  attachScene,
  editGeometry,
  removeItem,
  reindex,
  numberScene,
  indexLabel,
  validate,
} from "./model";
import type {
  Item,
  Scene,
  Kind,
  EffectKind,
  Effect,
  Patch,
  Geometry,
  Vec,
  BodyItem,
} from "./model";
import { Simulation } from "./simulation";
import type { Metrics } from "./simulation";
import { paint, fit, fromScreen, hit, handles, resized, rotationHandle, rotated } from "./render";
import type { Camera } from "./render";
import { ComponentIcon } from "./ComponentIcon";
import "./App.css";
const format = (n: number) => Number(n.toFixed(4)).toString();
function Tool({
  label,
  children,
  onClick,
  disabled = false,
  active = false,
  className = "",
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      className={`tool ${active ? "active" : ""} ${className}`}
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
function Num({
  label,
  value,
  unit = "",
  min = -1e5,
  max = 1e5,
  disabled = false,
  onChange,
}: {
  label: string;
  value: number;
  unit?: string;
  min?: number;
  max?: number;
  disabled?: boolean;
  onChange: (n: number) => void;
}) {
  const [draft, setDraft] = useState(format(value)),
    [bad, setBad] = useState(false),
    focused = useRef(false);
  useEffect(() => {
    if (!focused.current) {
      setDraft(format(value));
      setBad(false);
    }
  }, [value]);
  return (
    <label className={"number " + (bad ? "invalid" : "")}>
      <span>{label}</span>
      <div>
        <input
          aria-label={label}
          aria-invalid={bad}
          title={bad ? `Число от ${min} до ${max}` : undefined}
          value={draft}
          inputMode="decimal"
          readOnly={disabled}
          onFocus={() => {
            focused.current = true;
          }}
          onChange={(e) => {
            setDraft(e.target.value);
            setBad(false);
          }}
          onBlur={() => {
            focused.current = false;
            const n = Number(draft.replace(",", "."));
            if (!draft.trim() || !Number.isFinite(n) || n < min || n > max) {
              setBad(true);
              return;
            }
            if (n !== value) onChange(n);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setDraft(format(value));
              setBad(false);
              focused.current = false;
            }
          }}
        />
        <small>{unit}</small>
      </div>
    </label>
  );
}
function VectorFields({
  label,
  value,
  unit,
  onChange,
  disabled = false,
}: {
  label: string;
  value: Vec;
  unit: string;
  onChange: (v: Vec) => void;
  disabled?: boolean;
}) {
  const magnitude = Math.hypot(value.x, value.y);
  const [zeroAngle, setZeroAngle] = useState(0);
  const angle = magnitude > 0 ? Math.atan2(-value.y, value.x) * 180 / Math.PI : zeroAngle;
  const setPolar = (length: number, degrees: number) => {
    setZeroAngle(degrees);
    const radians = degrees * Math.PI / 180;
    onChange({ x: length * Math.cos(radians), y: -length * Math.sin(radians) });
  };
  return (
    <div className="vector-fields">
      <Num label={`|${label}|`} value={magnitude} min={0} unit={unit}
        disabled={disabled} onChange={(n) => setPolar(n, angle)} />
      <div className="pair">
        <Num label={`${label}: угол к X`} value={angle} unit="°"
          disabled={disabled} onChange={(n) => setPolar(magnitude, n)} />
        <Num label={`${label}: угол к Y`} value={angle + 90} unit="°"
          disabled={disabled} onChange={(n) => setPolar(magnitude, n - 90)} />
      </div>
      <details>
        <summary>Проекции X/Y</summary>
        <div className="pair">
          <Num label={`${label}ₓ`} value={value.x} unit={unit} disabled onChange={() => {}} />
          <Num label={`${label}ᵧ`} value={value.y} unit={unit} disabled onChange={() => {}} />
        </div>
        <small>X = |{label}| cos α; Y = −|{label}| sin α</small>
      </details>
    </div>
  );
}

const observed = [
  ["Ускорение a", 0, "м/с²"],
  ["Сила тяжести Fтяж", 2, "Н"],
  ["Реакция контакта N", 4, "Н"],
  ["Трение Fтр", 6, "Н"],
  ["Упругость Fупр", 8, "Н"],
  ["Реакция крепления R", 10, "Н"],
  ["Натяжение T", 12, "Н"],
  ["Результирующая F", 14, "Н"],
  ["Вес P", 16, "Н"],
] as const;
type Pending = {
  kind: EffectKind;
  scope: "selection" | "current" | "all";
  ids: string[];
  editing?: string;
};
export default function App() {
  const [scene, setScene] = useState<Scene>(() => structuredClone(initial)),
    [selected, setSelected] = useState<string | null>("2"),
    [grid, setGrid] = useState(true),
    [showAuto, setShowAuto] = useState(false),
    [preview, setPreview] = useState<{ source: Scene; scene: Scene } | null>(null),
    [pending, setPending] = useState<Pending | null>(null),
    [running, setRunning] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState<{ text: string; error: boolean } | null>(
      null,
    ),
    [counts, setCounts] = useState([0, 0]);
  const canvas = useRef<HTMLCanvasElement>(null),
    file = useRef<HTMLInputElement>(null),
    current = useRef(scene),
    display = useRef(scene),
    snapshot = useRef<Scene | null>(null),
    simulation = useRef<Simulation | null>(null),
    past = useRef<Scene[]>([]),
    future = useRef<Scene[]>([]),
    metrics = useRef<Metrics | null>(null),
    noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const camera = useRef<Camera>({ x: 0, y: 0.7, scale: 90 }),
    cameraTarget = useRef<Camera>({ x: 0, y: 0.7, scale: 90 }),
    state = useRef({ selected, grid, pending, running, showAuto }),
    hover = useRef<string | null>(null),
    space = useRef(false),
    drag = useRef<{ id: string; x: number; y: number } | null>(null);
  const gesture = useRef<{
    type: "pan" | "move" | "resize" | "rotate";
    id?: string;
    start: Vec;
    screen: Vec;
    before: Scene;
    original?: Geometry;
    handle?: number;
    camera: Camera;
  } | null>(null);
  const update = (s: Scene) => {
    current.current = s;
    display.current = s;
    setScene(s);
  };
  const tell = (text: string, error = false) => {
    clearTimeout(noticeTimer.current);
    setNotice({ text, error });
    if (!error) noticeTimer.current = setTimeout(() => setNotice(null), 3500);
  };
  const remember = (s: Scene) => {
    past.current.push(structuredClone(s));
    if (past.current.length > 100) past.current.shift();
    future.current = [];
    setCounts([past.current.length, 0]);
  };
  const commit = (s: Scene) => {
    s = numberScene(s);
    if (!running) remember(current.current);
    update(s);
  };
  const change = (id: string, patch: Patch) => {
    let s = {
      ...current.current,
      items: current.current.items.map((o) =>
        o.id === id ? ({ ...o, ...patch } as Item) : o,
      ),
    };
    try {
      if (!running && ["x", "y", "w", "h", "angle"].some((k) => k in patch))
        s = attachScene(
          editGeometry(current.current, id, patch),
          id,
          10 / camera.current.scale,
        );
      validate(s);
      if (running) simulation.current?.edit(id, patch);
      commit(s);
    } catch (e) {
      tell(e instanceof Error ? e.message : "Неверные параметры", true);
    }
  };
  const undo = (redo = false) => {
    if (running || pending) return;
    const from = redo ? future : past,
      to = redo ? past : future,
      s = from.current.pop();
    if (!s) return;
    to.current.push(structuredClone(current.current));
    update(s);
    setCounts([past.current.length, future.current.length]);
    if (!s.items.some((o) => o.id === selected)) setSelected(null);
  };
  const remove = () => {
    if (!selected || running || pending) return;
    commit(removeItem(current.current, selected));
    setSelected(null);
  };
  const centerView = () => {
    const rect = canvas.current?.getBoundingClientRect();
    if (rect)
      cameraTarget.current = fit(current.current, rect.width, rect.height);
  };
  useEffect(() => {
    state.current = { selected, grid, pending, running, showAuto };
  }, [selected, grid, pending, running, showAuto]);
  useEffect(() => {
    if (running) return;
    display.current = scene;
    if (!showAuto || !scene.items.some(body)) return;
    let cancelled = false;
    const runtime = new Simulation(scene, () => null, (calculated) => {
      if (cancelled) return;
      const values = new Map(calculated.items.filter(body).map(b => [b.id, b]));
      const view = { ...scene, items: scene.items.map(o => {
        const b = values.get(o.id);
        return body(o) && b ? { ...o, vx: b.vx, vy: b.vy, omega: b.omega, derived: b.derived, forceSamples: b.forceSamples } : o;
      }) };
      display.current = view;
      setPreview({ source: scene, scene: view });
    }, () => {});
    const timer = setTimeout(() => {
      void runtime.start("preview").catch(e => {
        if (!cancelled) tell(`Автовекторы: ${e instanceof Error ? e.message : String(e)}`, true);
      });
    }, 150);
    return () => { cancelled = true; clearTimeout(timer); runtime.stop(); };
  }, [scene, showAuto, running]);
  useEffect(() => {
    const el = canvas.current!;
    const resize = new ResizeObserver(() => {
      if (el.width === 0) centerView();
    });
    resize.observe(el);
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect(),
        p = { x: e.clientX - r.left, y: e.clientY - r.top },
        old = cameraTarget.current,
        at = fromScreen(p, r, old),
        scale = Math.max(
          3,
          Math.min(1000, old.scale * Math.exp(-e.deltaY * 0.0015)),
        );
      cameraTarget.current = {
        x: at.x - (p.x - r.width / 2) / scale,
        y: at.y - (p.y - r.height / 2) / scale,
        scale,
      };
    };
    el.addEventListener("wheel", wheel, { passive: false });
    let raf = 0,
      last = 0;
    const frame = (now: number) => {
      const amount = 1 - Math.exp(-18 * Math.min(0.1, (now - last) / 1000));
      last = now;
      for (const k of ["x", "y", "scale"] as const)
        camera.current[k] +=
          (cameraTarget.current[k] - camera.current[k]) * amount;
      const st = state.current;
      const ids = st.pending
        ? st.pending.scope === "selection"
          ? st.pending.ids
          : display.current.items.filter(body).map((b) => b.id)
        : [];
      paint(
        el,
        display.current,
        camera.current,
        st.selected,
        st.grid,
        st.running,
        ids,
        hover.current,
        st.showAuto,
      );
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
      el.removeEventListener("wheel", wheel);
      simulation.current?.stop();
      clearTimeout(noticeTimer.current);
    };
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (e.code === "Space") {
        e.preventDefault();
        space.current = true;
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        ["z", "y"].includes(e.key.toLowerCase())
      ) {
        e.preventDefault();
        undo(e.key.toLowerCase() === "y" || e.shiftKey);
      }
      if (e.key === "Delete") remove();
      if (e.key === "Escape") {
        setPending(null);
        setNotice(null);
        gesture.current = null;
        drag.current = null;
      }
    };
    const release = (e: KeyboardEvent) => {
      if (e.code === "Space") space.current = false;
    };
    const blur = () => {
      space.current = false;
      gesture.current = null;
      drag.current = null;
    };
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", release);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", release);
      window.removeEventListener("blur", blur);
    };
  });
  const point = (x: number, y: number) => {
    const r = canvas.current!.getBoundingClientRect();
    return fromScreen({ x: x - r.left, y: y - r.top }, r, camera.current);
  };
  const snap = (v: number) => (grid ? Math.round(v * 10) / 10 : v);
  const add = (kind: Kind, p?: Vec) => {
    if (running) return;
    const at = p || { x: camera.current.x, y: camera.current.y };
    if (["force", "velocity", "acceleration"].includes(kind)) {
      const found = p
        ? hit(current.current.items, p, 8 / camera.current.scale, true)
        : current.current.items.find((o) => o.id === selected && body(o));
      setPending({
        kind: kind as EffectKind,
        scope: "selection",
        ids: found ? [found.id] : [],
      });
      return;
    }
    if (current.current.items.length >= 200) {
      tell("Не более 200 объектов", true);
      return;
    }
    const id = nextId(current.current.items),
      o = make(kind, id, snap(at.x), snap(at.y));
    let s: Scene = { version: 2, items: [...current.current.items, o] };
    s = attachScene(s, id, 10 / camera.current.scale);
    commit(s);
    setSelected(id);
  };
  const confirm = () => {
    if (!pending) return;
    if (!pending.editing && current.current.items.length >= 200) {
      tell("Не более 200 объектов", true);
      return;
    }
    const ids =
      pending.scope === "selection"
        ? pending.ids
        : current.current.items.filter(body).map((o) => o.id);
    if (pending.scope !== "all" && !ids.length) {
      tell("Выберите хотя бы одно тело", true);
      return;
    }
    const existing = current.current.items.find(
        (o) => o.id === pending.editing,
      ),
      id = existing?.id || nextId(current.current.items);
    const o: Effect = {
      ...(existing && effect(existing)
        ? existing
        : (make(pending.kind, id) as Effect)),
      scope: pending.scope === "all" ? "all" : "selection",
      targets: pending.scope === "all" ? [] : ids,
    };
    commit({
      version: 2,
      items: existing
        ? current.current.items.map((i) => (i.id === id ? o : i))
        : [...current.current.items, o],
    });
    setPending(null);
    setSelected(id);
  };
  const choose = (id: string) => {
    if (pending) {
      if (!current.current.items.some((o) => o.id === id && body(o))) return;
      setPending({
        ...pending,
        scope: "selection",
        ids: pending.ids.includes(id)
          ? pending.ids.filter((i) => i !== id)
          : [...pending.ids, id],
      });
    } else setSelected(id);
  };
  const pointerDown = (e: PE<HTMLCanvasElement>) => {
    const p = point(e.clientX, e.clientY),
      screen = { x: e.clientX, y: e.clientY };
    canvas.current!.setPointerCapture(e.pointerId);
    if (e.button === 1 || e.button === 2 || space.current) {
      gesture.current = {
        type: "pan",
        start: p,
        screen,
        before: current.current,
        camera: { ...camera.current },
      };
      return;
    }
    const o = hit(
      display.current.items,
      p,
      8 / camera.current.scale,
      !!pending,
    );
    if (pending) {
      if (o) choose(o.id);
      return;
    }
    if (running) {
      if (o) {
        setSelected(o.id);
        if (body(o) && !o.fixed && !o.trajectory)
          drag.current = { id: o.id, ...p };
      } else setSelected(null);
      return;
    }
    const chosen = current.current.items.find((o) => o.id === selected);
    if (chosen && geo(chosen)) {
      const i = handles(chosen, current.current.items).findIndex(
        (q) => Math.hypot(q.x - p.x, q.y - p.y) < 8 / camera.current.scale,
      );
      const turn = rotationHandle(chosen, camera.current.scale);
      const rotating = turn && Math.hypot(turn.x - p.x, turn.y - p.y) < 12 / camera.current.scale;
      if (i >= 0 || rotating) {
        gesture.current = {
          type: rotating ? "rotate" : "resize",
          id: chosen.id,
          start: p,
          screen,
          before: structuredClone(current.current),
          original: structuredClone(chosen),
          handle: i,
          camera: { ...camera.current },
        };
        return;
      }
    }
    if (o && geo(o)) {
      setSelected(o.id);
      gesture.current = {
        type: "move",
        id: o.id,
        start: p,
        screen,
        before: structuredClone(current.current),
        original: structuredClone(o),
        camera: { ...camera.current },
      };
    } else {
      setSelected(null);
      gesture.current = {
        type: "pan",
        start: p,
        screen,
        before: current.current,
        camera: { ...camera.current },
      };
    }
  };
  const pointerMove = (e: PE<HTMLCanvasElement>) => {
    const p = point(e.clientX, e.clientY);
    if (drag.current) {
      drag.current = { ...drag.current, ...p };
      return;
    }
    const g = gesture.current;
    if (!g) {
      hover.current = pending
        ? hit(current.current.items, p, 8 / camera.current.scale, true)?.id ||
          null
        : null;
      return;
    }
    if (g.type === "pan") {
      cameraTarget.current = {
        ...g.camera,
        x: g.camera.x - (e.clientX - g.screen.x) / g.camera.scale,
        y: g.camera.y - (e.clientY - g.screen.y) / g.camera.scale,
      };
      camera.current = { ...cameraTarget.current };
      return;
    }
    const o = g.original!,
      patch =
        g.type === "rotate"
          ? rotated(o, g.start, p)
          : g.type === "resize"
          ? resized(
              o,
              g.handle!,
              { x: snap(p.x), y: snap(p.y) },
              g.before.items,
            )
          : {
              x: snap(o.x + p.x - g.start.x),
              y: snap(o.y + p.y - g.start.y),
              ...(o.kind === "bearing" ? { bindings: [] } : {}),
            };
    update(editGeometry(g.before, o.id, patch));
  };
  const pointerUp = () => {
    const g = gesture.current;
    if (
      g &&
      g.type !== "pan" &&
      JSON.stringify(g.before) !== JSON.stringify(current.current)
    ) {
      remember(g.before);
      update(attachScene(current.current, g.id!, 10 / camera.current.scale));
    }
    gesture.current = null;
    drag.current = null;
    hover.current = null;
  };
  const stop = () => {
    simulation.current?.stop();
    simulation.current = null;
    if (snapshot.current) update(snapshot.current);
    snapshot.current = null;
    setRunning(false);
    setBusy(false);
    drag.current = null;
    metrics.current = null;
  };
  const start = async (mode: "dynamic" | "static") => {
    if (running) {
      stop();
      return;
    }
    if (pending) return;
    try {
      validate(current.current);
    } catch (e) {
      tell(String(e), true);
      return;
    }
    if (!current.current.items.some(body)) {
      tell("Добавьте тело", true);
      return;
    }
    snapshot.current = structuredClone(current.current);
    setRunning(true);
    setBusy(true);
    setNotice(null);
    let lastPanel = 0,
      converged = false,
      overloaded = false;
    const fail = (message: string) => {
      if (simulation.current === runtime) {
        stop();
        tell(message, true);
      }
    };
    const runtime = new Simulation(
      current.current,
      () => drag.current,
      (s, d, m) => {
        current.current = s;
        display.current = d;
        metrics.current = m;
        if (m.time - lastPanel >= 0.1 || m.settled) {
          setScene(s);
          lastPanel = m.time;
        }
        if (m.settled && !converged) {
          converged = true;
          tell("Статическое равновесие найдено");
        }
        if (m.dropped > 0.5 && !overloaded) {
          overloaded = true;
          tell(
            "Расчёт не успевает за реальным временем. Уменьшите нагрузку.",
            true,
          );
        }
      },
      fail,
    );
    simulation.current = runtime;
    try {
      await runtime.start(mode);
      if (simulation.current === runtime) setBusy(false);
    } catch (e) {
      fail(e instanceof Error ? e.message : "Ошибка WASM");
    }
  };
  const save = () => {
    const s = validate(
        running && snapshot.current ? snapshot.current : current.current,
      ),
      url = URL.createObjectURL(
        new Blob([JSON.stringify(s, null, 2)], { type: "application/json" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = "mechanics.physics.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const chosen = scene.items.find((o) => o.id === selected),
    bodies = scene.items.filter(body);
  const field = (
    key: string,
    label: string,
    unit = "",
    min = -1e5,
    max = 1e5,
    disabled = false,
  ) => (
    <Num
      key={chosen!.id + key}
      label={label}
      value={(chosen as unknown as Record<string, number>)[key]}
      unit={unit}
      min={min}
      max={max}
      disabled={disabled}
      onChange={(n) =>
        change(chosen!.id, {
          [key]: n,
          ...(chosen &&
          geo(chosen) &&
          ["circle", "pulley", "bearing"].includes(chosen.kind) &&
          key === "w"
            ? { h: n }
            : {}),
        })
      }
    />
  );
  const variableVector = (
    o: BodyItem,
    label: string,
    index: number,
    unit: string,
  ) => (
    <VectorFields
      label={`${label}_${indexLabel(o)}`}
      value={{ x: o.derived?.[index] || 0, y: o.derived?.[index + 1] || 0 }}
      unit={unit}
      disabled
      onChange={() => {}}
    />
  );
  return (
    <div className="app">
      <nav className="toolbar" aria-label="Инструменты">
        <Tool
          label="Новый проект"
          disabled={running || !!pending}
          onClick={() => {
            commit(structuredClone(initial));
            setSelected("2");
            centerView();
          }}
        >
          <FileIcon />
        </Tool>
        <Tool
          label="Открыть проект"
          disabled={running || busy || !!pending}
          onClick={() => file.current?.click()}
        >
          <FolderOpenIcon />
        </Tool>
        <Tool label="Скачать проект" onClick={save}>
          <DownloadSimpleIcon />
        </Tool>
        <span className="divider" />
        <Tool
          label="Отменить · Ctrl Z"
          disabled={running || !!pending || !counts[0]}
          onClick={() => undo()}
        >
          <ArrowCounterClockwiseIcon />
        </Tool>
        <Tool
          label="Повторить · Ctrl Y"
          disabled={running || !!pending || !counts[1]}
          onClick={() => undo(true)}
        >
          <ArrowClockwiseIcon />
        </Tool>
        <Tool
          label="Удалить · Delete"
          disabled={running || !!pending || !chosen}
          onClick={remove}
        >
          <TrashIcon />
        </Tool>
        <span className="divider" />
        <Tool
          label="Сетка 1 м · привязка 0,1 м"
          active={grid}
          onClick={() => setGrid(!grid)}
        >
          <GridFourIcon />
        </Tool>
        <Tool label="Центрировать систему" onClick={centerView}>
          <CrosshairSimpleIcon />
        </Tool>
        <Tool label="Автовекторы" active={showAuto} onClick={() => setShowAuto(!showAuto)}>
          <FlowArrowIcon />
        </Tool>
        <span className="spacer" />
        <Tool
          label="Найти статическое равновесие"
          disabled={running || !!pending}
          onClick={() => start("static")}
        >
          <ScalesIcon />
        </Tool>
        <Tool
          label={
            running ? "Остановить и восстановить сцену" : "Запустить симуляцию"
          }
          active={running}
          disabled={!!pending}
          onClick={() => start("dynamic")}
          className="run"
        >
          {busy ? (
            <CircleNotchIcon className="spin" />
          ) : running ? (
            <StopIcon weight="fill" />
          ) : (
            <PlayIcon weight="fill" />
          )}
        </Tool>
      </nav>
      <main>
        <aside className="left">
          <section>
            <h2>Объекты сцены</h2>
            <div className="scroll object-list">
              {scene.items.map((o) => (
                <button
                  key={o.id}
                  className={
                    "object-row " +
                    (selected === o.id ? "selected" : "") +
                    (pending &&
                    ((pending.scope !== "selection" && body(o)) ||
                      pending.ids.includes(o.id))
                      ? " target"
                      : "")
                  }
                  onClick={() => choose(o.id)}
                >
                  <ComponentIcon kind={o.kind} />
                  {geo(o) && o.fixed && (
                    <LockSimpleIcon size={12} className="lock" />
                  )}
                  <span>
                    {o.kind === "acceleration" && o.gravity
                      ? "Свободное падение"
                      : names[o.kind]}
                  </span>
                  <i>{indexLabel(o)}</i>
                </button>
              ))}
            </div>
          </section>
          <section>
            <h2>Компоненты</h2>
            <div className="scroll components">
              {kinds.map((kind) => (
                <button
                  key={kind}
                  draggable={!running && !pending}
                  disabled={running || !!pending}
                  onDragStart={(e) =>
                    e.dataTransfer.setData("text/plain", kind)
                  }
                  onClick={() => add(kind)}
                >
                  <ComponentIcon kind={kind} />
                  <span>{names[kind]}</span>
                </button>
              ))}
            </div>
          </section>
        </aside>
        <div className="workspace">
          <canvas
            ref={canvas}
            tabIndex={0}
            aria-label="Чертёж механической системы"
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerUp}
            onPointerCancel={pointerUp}
            onDragOver={(e) => {
              e.preventDefault();
              const p = point(e.clientX, e.clientY);
              hover.current =
                hit(current.current.items, p, 8 / camera.current.scale, true)
                  ?.id || null;
            }}
            onDragLeave={() => {
              hover.current = null;
            }}
            onDrop={(e) => {
              e.preventDefault();
              const kind = e.dataTransfer.getData("text/plain") as Kind;
              if (kinds.includes(kind)) add(kind, point(e.clientX, e.clientY));
              hover.current = null;
            }}
          />
          {pending && (
            <div
              className="assignment"
              role="dialog"
              aria-label="Назначение воздействия"
            >
              <strong>{names[pending.kind]}</strong>
              <select
                aria-label="Получатели воздействия"
                value={pending.scope}
                onChange={(e) =>
                  setPending({
                    ...pending,
                    scope: e.target.value as Pending["scope"],
                  })
                }
              >
                <option value="selection">
                  Выбранные тела ({pending.ids.length})
                </option>
                <option value="current">Все текущие тела</option>
                <option value="all">Все тела, включая будущие</option>
              </select>
              <Tool
                label="Продолжить"
                disabled={pending.scope === "selection" && !pending.ids.length}
                onClick={confirm}
              >
                <CheckIcon />
              </Tool>
              <Tool
                label="Отменить назначение"
                onClick={() => setPending(null)}
              >
                <XIcon />
              </Tool>
            </div>
          )}
          {notice && (
            <div
              className={"notice " + (notice.error ? "error" : "")}
              role={notice.error ? "alert" : "status"}
            >
              <span>{notice.text}</span>
              <Tool label="Закрыть сообщение" onClick={() => setNotice(null)}>
                <XIcon />
              </Tool>
            </div>
          )}
        </div>
        <aside className="right">
          <section>
            <h2>{pending ? "Назначение" : "Свойства"}</h2>
            <div className="scroll properties">
              {pending ? (
                <div className="target-list">
                  {bodies.map((b) => (
                    <label className="check" key={b.id}>
                      <input
                        type="checkbox"
                        checked={
                          pending.scope !== "selection" ||
                          pending.ids.includes(b.id)
                        }
                        onChange={() => choose(b.id)}
                      />
                      {names[b.kind]} {indexLabel(b)}
                    </label>
                  ))}
                </div>
              ) : chosen ? (
                <>
                  <div className="property-title">
                    <ComponentIcon kind={chosen.kind} />
                    <span>{names[chosen.kind]}</span>
                    <input
                      className="index-input"
                      aria-label="Индекс"
                      key={chosen.id + ":" + chosen.index}
                      defaultValue={indexLabel(chosen)}
                      disabled={running}
                      onBlur={(e) => {
                        try {
                          if (e.target.value !== indexLabel(chosen)) {
                            commit(
                              reindex(
                                current.current,
                                chosen.id,
                                e.target.value,
                              ),
                            );
                          }
                        } catch (err) {
                          e.target.value = indexLabel(chosen);
                          tell(String(err), true);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                      }}
                    />
                  </div>
                  {effect(chosen) ? (
                    <>
                      <VectorFields
                        label={
                          chosen.kind === "force"
                            ? "F"
                            : chosen.kind === "velocity"
                              ? "v"
                              : "a"
                        }
                        value={chosen.vector}
                        unit={
                          chosen.kind === "force"
                            ? "Н"
                            : chosen.kind === "velocity"
                              ? "м/с"
                              : "м/с²"
                        }
                        onChange={(vector) => change(chosen.id, { vector })}
                      />
                      <div className="target-summary">
                        {chosen.scope === "all"
                          ? "Все тела, включая будущие"
                          : chosen.targets
                              .map(
                                (id) =>
                                  `${names[scene.items.find((o) => o.id === id)!.kind]} ${indexLabel(scene.items.find((o) => o.id === id)!)}`,
                              )
                              .join(", ")}
                      </div>
                      <button
                        className="text-action"
                        disabled={running}
                        onClick={() =>
                          setPending({
                            kind: chosen.kind,
                            scope: chosen.scope === "all" ? "all" : "selection",
                            ids: [...chosen.targets],
                            editing: chosen.id,
                          })
                        }
                      >
                        Изменить получателей
                      </button>
                      {chosen.kind === "acceleration" && (
                        <label className="check">
                          <input
                            type="checkbox"
                            checked={!!chosen.gravity}
                            onChange={(e) =>
                              change(chosen.id, { gravity: e.target.checked })
                            }
                          />
                          Ускорение свободного падения
                        </label>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="pair">
                        {field("x", "x", "м", -1e5, 1e5, running)}
                        {field("y", "y", "м", -1e5, 1e5, running)}
                      </div>
                      {!["rod", "surface"].includes(chosen.kind) && <div className="pair">
                        {field(
                          "w",
                          chosen.kind === "circle" ||
                            chosen.kind === "pulley" ||
                            chosen.kind === "bearing"
                            ? "Диаметр"
                            : "Ширина",
                          "м",
                          0.001,
                          1e5,
                          running,
                        )}
                        {!["circle", "pulley", "bearing"].includes(
                          chosen.kind,
                        ) && field("h", "Высота", "м", 0.001, 1e5, running)}
                      </div>}
                      {!["rod", "surface"].includes(chosen.kind) && field("angle", "Угол φ", "рад", -1e5, 1e5, running)}
                      {body(chosen) ? (
                        <>
                          <div className="pair">
                            {field(
                              "mass",
                              "Масса m",
                              "кг",
                              chosen.fixed || chosen.trajectory ? 0 : 0.001,
                            )}
                            {field("mu", "Трение μ", "", 0)}
                          </div>
                          {field("restitution", "Восстановление e", "", 0, 1)}
                          <VectorFields
                            label="v"
                            value={{ x: chosen.vx, y: chosen.vy }}
                            unit="м/с"
                            onChange={(v) =>
                              change(chosen.id, { vx: v.x, vy: v.y })
                            }
                          />
                          {field("omega", "Вращение ω", "рад/с")}
                          <label className="check">
                            <input
                              type="checkbox"
                              checked={chosen.fixed}
                              disabled={running}
                              onChange={(e) =>
                                change(chosen.id, { fixed: e.target.checked })
                              }
                            />
                            Закрепить{" "}
                            {chosen.kind === "pulley" ? "ось" : "тело"}
                          </label>
                          <label className="check">
                            <input
                              type="checkbox"
                              checked={!!chosen.trajectory}
                              disabled={running}
                              onChange={(e) =>
                                change(chosen.id, {
                                  trajectory: e.target.checked
                                    ? {
                                        x: String(chosen.x),
                                        y: String(chosen.y),
                                        angle: String(chosen.angle),
                                      }
                                    : undefined,
                                })
                              }
                            />
                            Заданное движение
                          </label>
                          {chosen.trajectory && (
                            <div className="formulas">
                              {(["x", "y", "angle"] as const).map((key) => (
                                <label key={chosen.id + key}>
                                  <span>{key === "angle" ? "φ" : key}(t)</span>
                                  <input
                                    aria-label={`${key}(t)`}
                                    defaultValue={chosen.trajectory![key]}
                                    maxLength={255}
                                    onBlur={(e) => {
                                      if (
                                        e.target.value.trim() !==
                                        chosen.trajectory![key]
                                      )
                                        change(chosen.id, {
                                          trajectory: {
                                            ...chosen.trajectory!,
                                            [key]: e.target.value.trim(),
                                          },
                                        });
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter")
                                        e.currentTarget.blur();
                                    }}
                                  />
                                </label>
                              ))}
                              <small>
                                t — секунды. Например: 2 + sin(pi*t). Идеальный
                                привод: реакции не меняют заданный путь.
                              </small>
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          {chosen.kind === "bearing" ? (
                            <label className="check">
                              <input
                                type="checkbox"
                                checked={chosen.fixed}
                                disabled={running}
                                onChange={(e) =>
                                  change(chosen.id, { fixed: e.target.checked })
                                }
                              />
                              Закрепить центр
                            </label>
                          ) : (
                            <>
                              {field("length", "Длина l₀", "м", 0.001)}
                              {chosen.kind === "spring" && (
                                <div className="pair">
                                  {field("stiffness", "Жёсткость k", "Н/м", 0)}
                                  {field(
                                    "damping",
                                    "Демпфирование",
                                    "Н·с/м",
                                    0,
                                  )}
                                </div>
                              )}
                              {chosen.kind === "rope" && (
                                <label className="select-field">
                                  <span>Через блок</span>
                                  <select
                                    aria-label="Через блок"
                                    value={chosen.via || ""}
                                    disabled={running}
                                    onChange={(e) =>
                                      change(chosen.id, {
                                        via: e.target.value || undefined,
                                      })
                                    }
                                  >
                                    <option value="">Без блока</option>
                                    {bodies
                                      .filter((b) => b.kind === "pulley")
                                      .map((b) => (
                                        <option key={b.id} value={b.id}>
                                          Блок {indexLabel(b)}
                                        </option>
                                      ))}
                                  </select>
                                </label>
                              )}
                            </>
                          )}
                        </>
                      )}
                      {(chosen.kind === "rod" || connector(chosen)) && (
                        <div className="connections">
                          {chosen.ends.map(
                            (a, i) =>
                              a && (
                                <div key={i}>
                                  <span>
                                    Конец {i + 1} →{" "}
                                    {
                                      names[
                                        scene.items.find((o) => o.id === a.id)!
                                          .kind
                                      ]
                                    }{" "}
                                    {indexLabel(scene.items.find((o) => o.id === a.id)!)}
                                  </span>
                                  <Tool
                                    label={`Отсоединить конец ${i + 1}`}
                                    disabled={running}
                                    onClick={() =>
                                      change(chosen.id, {
                                        ends: chosen.ends.map((a, j) =>
                                          i === j ? null : a,
                                        ),
                                      })
                                    }
                                  >
                                    <XIcon />
                                  </Tool>
                                </div>
                              ),
                          )}
                          {connector(chosen) &&
                            chosen.kind === "bearing" &&
                            chosen.bindings.map((a, i) => (
                              <div key={i}>
                                <span>
                                  {
                                    names[
                                      scene.items.find((o) => o.id === a.id)!
                                        .kind
                                    ]
                                  }{" "}
                                  {indexLabel(scene.items.find((o) => o.id === a.id)!)}
                                </span>
                                <Tool
                                  label={`Отсоединить тело ${indexLabel(scene.items.find((o) => o.id === a.id)!)}`}
                                  disabled={running}
                                  onClick={() =>
                                    change(chosen.id, {
                                      bindings: chosen.bindings.filter(
                                        (_, j) => i !== j,
                                      ),
                                    })
                                  }
                                >
                                  <XIcon />
                                </Tool>
                              </div>
                            ))}
                        </div>
                      )}
                    </>
                  )}
                </>
              ) : null}
            </div>
          </section>
          <section>
            <h2>Переменные</h2>
            <div className="scroll variables">
              {(showAuto && !running && preview?.source === scene ? preview.scene : scene).items.map((o) => (
                <details key={o.id} open={o.id === selected || effect(o)}>
                  <summary>
                    {o.kind === "acceleration" && o.gravity
                      ? "Свободное падение"
                      : names[o.kind]}{" "}
                    <i>{indexLabel(o)}</i>
                  </summary>
                  {effect(o) ? (
                    <VectorFields
                      label={`${o.gravity ? "g" : o.kind === "force" ? "F" : o.kind === "velocity" ? "v" : "a"}_${indexLabel(o)}`}
                      value={o.vector}
                      unit={
                        o.kind === "force"
                          ? "Н"
                          : o.kind === "velocity"
                            ? "м/с"
                            : "м/с²"
                      }
                      onChange={(vector) => change(o.id, { vector })}
                    />
                  ) : body(o) ? (
                    <>
                      <Num
                        label={`m_${indexLabel(o)}`}
                        value={o.mass}
                        unit="кг"
                        min={o.fixed || o.trajectory ? 0 : 0.001}
                        onChange={(mass) => change(o.id, { mass })}
                      />
                      <VectorFields
                        label={`v_${indexLabel(o)}`}
                        value={{ x: o.vx, y: o.vy }}
                        unit="м/с"
                        disabled={showAuto && !running}
                        onChange={(v) => change(o.id, { vx: v.x, vy: v.y })}
                      />
                      {(running || showAuto) && o.derived &&
                        observed.map(([label, i, unit]) => (
                          <div key={i}>{variableVector(o, label, i, unit)}</div>
                        ))}

                    </>
                  ) : o.kind !== "bearing" ? (
                    <>
                      <Num
                        label={`l_${indexLabel(o)}`}
                        value={o.length}
                        unit="м"
                        min={0.001}
                        onChange={(length) => change(o.id, { length })}
                      />
                      {o.kind === "spring" && (
                        <Num
                          label={`k_${indexLabel(o)}`}
                          value={o.stiffness}
                          unit="Н/м"
                          min={0}
                          onChange={(stiffness) => change(o.id, { stiffness })}
                        />
                      )}
                    </>
                  ) : null}
                </details>
              ))}
            </div>
          </section>
        </aside>
      </main>
      <input
        ref={file}
        type="file"
        hidden
        accept=".json,.physics.json"
        onChange={async (e) => {
          const input = e.currentTarget,
            f = input.files?.[0];
          if (!f) return;
          setBusy(true);
          try {
            if (f.size > 2e6) throw Error("Файл больше 2 МБ");
            const s = validate(JSON.parse(await f.text()));
            commit(s);
            setSelected(null);
            centerView();
          } catch (err) {
            tell(
              err instanceof Error ? err.message : "Не удалось открыть проект",
              true,
            );
          } finally {
            input.value = "";
            setBusy(false);
          }
        }}
      />
    </div>
  );
}
