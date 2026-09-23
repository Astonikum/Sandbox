import { useEffect, useRef, useState } from "react";
import { useCombobox } from "downshift";
import type { PointerEvent as PE, ReactNode } from "react";
import { createPortal } from "react-dom";
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
import { EyeIcon } from "@phosphor-icons/react/dist/csr/Eye";
import { EyeSlashIcon } from "@phosphor-icons/react/dist/csr/EyeSlash";
import { DotsThreeIcon } from "@phosphor-icons/react/dist/csr/DotsThree";
import { PlusIcon } from "@phosphor-icons/react/dist/csr/Plus";
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
} from "./model";
import { Simulation } from "./simulation";
import type { Metrics } from "./simulation";
import { paint, fit, fromScreen, hit, handles, resized, rotationHandle, rotated } from "./render";
import type { Camera } from "./render";
import { ComponentIcon } from "./ComponentIcon";
import { allowedUnits, bindableVariables, bindVariable, bindingKey, convertUnit, derivedFields, displayUnit, displayValue, ensureVariables, fields, knownUnit, readField, removeVariable, saveVariable, setVariable, syncVariables, unitChoices } from './variables';
import type { Variable } from './variables';
import { GraphEditor } from './GraphEditor';
import "./App.css";
const format = (n: number) => Number(n.toPrecision(6)).toString();
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
function InlineNumber({ label, value, disabled, onChange }: { label: string; value: number; disabled?: boolean; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState(format(value));
  const [bad, setBad] = useState(false);
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) { setDraft(format(value)); setBad(false); } }, [value]);
  return <input className={bad ? 'invalid' : ''} aria-label={label} aria-invalid={bad} value={draft} readOnly={disabled} inputMode="decimal"
    onFocus={() => { focused.current = true; }} onChange={e => { setDraft(e.target.value); setBad(false); }}
    onBlur={() => { focused.current = false; const n = Number(draft.replace(',', '.')); if (!draft.trim() || !Number.isFinite(n)) { setBad(true); return; } if (n !== value) onChange(n); }}
    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setDraft(format(value)); setBad(false); e.currentTarget.blur(); } }} />;
}
function Symbol({ value }: { value: string }) { return <span className="symbol">{value[0]}<sub>{value.slice(1)}</sub></span>; }
function UnitSelect({ variable, onChange }: { variable: Variable; onChange: (unit: string) => void }) {
  const options = unitChoices(variable.unit);
  return options.length > 1 ? <select className="unit-select" aria-label={`Единица ${variable.symbol}`} title="Единица измерения" value={displayUnit(variable)} onChange={e => onChange(e.target.value)}>{options.map(unit => <option key={unit} value={unit}>{unit}</option>)}</select> : <small className="unit-static">{variable.unit}</small>;
}
function UnitCombobox({ value, onChange }: { value: string; onChange: (unit: string) => void }) {
  const search = value.replace(/[HhNn]/g, 'Н');
  const items = allowedUnits.filter(unit => unit.startsWith(search));
  const { isOpen, highlightedIndex, getLabelProps, getInputProps, getToggleButtonProps, getMenuProps, getItemProps } = useCombobox({
    items, inputValue: value, itemToString: item => item ?? '',
    onInputValueChange: ({ inputValue }) => onChange(inputValue ?? ''),
    onSelectedItemChange: ({ selectedItem }) => onChange(selectedItem ?? ''),
  });
  return <div className="unit-entry">
    <label {...getLabelProps()}>Единица измерения</label>
    <div className="unit-combobox">
      <div className="unit-combobox-input"><input {...getInputProps({ 'aria-label': 'Единица измерения', maxLength: 30, placeholder: 'Без единицы' })} /><button type="button" aria-label="Показать единицы" {...getToggleButtonProps()}>⌄</button></div>
      <ul {...getMenuProps()} className={`unit-options ${isOpen ? '' : 'hidden'}`}>{isOpen && items.map((unit, index) => <li key={unit || 'none'} {...getItemProps({ item: unit, index })} className={highlightedIndex === index ? 'highlighted' : ''}>{unit || 'Без единицы'}</li>)}</ul>
    </div>
  </div>;
}
function newSymbol(variables: Variable[] = []) { let n = 1; while (variables.some(v => v.symbol === `q${n}`)) n++; return `q${n}`; }
function VariableEditor({ variable, suggestedSymbol, onSave, onClose }: { variable?: Variable; suggestedSymbol: string; onSave: (draft: { symbol: string; value: number; unit: string }) => string | null; onClose: () => void }) {
  const [symbol, setSymbol] = useState(variable?.symbol ?? suggestedSymbol);
  const [value, setValue] = useState(String(variable ? displayValue(variable) : 0));
  const [unit, setUnit] = useState(variable ? displayUnit(variable) : '');
  const [error, setError] = useState('');
  return <div className="editor-backdrop" role="presentation" onClick={onClose}><form className="variable-editor" role="dialog" aria-modal="true" aria-label={variable ? `Изменить ${variable.symbol}` : 'Новая переменная'} onClick={e => e.stopPropagation()} onSubmit={e => {
    e.preventDefault();
    const n = Number(value.replace(',', '.'));
    if (!value.trim() || !Number.isFinite(n)) { setError('Введите числовое значение'); return; }
    if (!knownUnit(unit) && unit !== (variable && displayUnit(variable))) { setError('Выберите единицу из списка'); return; }
    const error = onSave({ symbol, value: n, unit });
    if (error) setError(error); else onClose();
  }}>
    <h3>{variable ? `Переменная ${variable.symbol}` : 'Новая переменная'}</h3>
    <label>Литера <input aria-label="Литера" value={symbol} maxLength={40} onChange={e => setSymbol(e.target.value)} autoFocus /></label>
    <label>Значение <input aria-label="Значение" value={value} inputMode="decimal" onChange={e => setValue(e.target.value)} /></label>
    <UnitCombobox value={unit} onChange={next => { setUnit(next); setError(''); }} />
    {error && <p className="range-error">{error}</p>}
    <div className="range-actions"><button type="button" onClick={onClose}>Отмена</button><button type="submit" className="primary">Сохранить</button></div>
  </form></div>;
}
function RangeEditor({ variable, onSave, onRemove, onClose }: { variable: Variable; onSave: (range: NonNullable<Variable['range']>) => void; onRemove: () => void; onClose: () => void }) {
  const unit = displayUnit(variable), toShown = (n: number) => convertUnit(n, variable.unit, unit), toStored = (n: number) => convertUnit(n, unit, variable.unit);
  const [min, setMin] = useState(toShown(variable.range?.min ?? Math.min(0, variable.value)));
  const [max, setMax] = useState(toShown(variable.range?.max ?? Math.max(10, variable.value + 1)));
  const [step, setStep] = useState(toShown(variable.range?.step ?? .1));
  const [error, setError] = useState('');
  return <div className="editor-backdrop" role="presentation" onClick={onClose}><div className="range-editor" role="dialog" aria-modal="true" aria-label={`Диапазон ${variable.symbol}`} onClick={e => e.stopPropagation()}>
    <h3>Диапазон {variable.symbol} {unit}</h3>
    <label>От <input type="number" value={min} onChange={e => setMin(Number(e.target.value))} /></label>
    <label>До <input type="number" value={max} onChange={e => setMax(Number(e.target.value))} /></label>
    <label>Шаг <input type="number" value={step} onChange={e => setStep(Number(e.target.value))} /></label>
    {error && <p className="range-error">{error}</p>}
    <div className="range-actions">{variable.range && <button onClick={onRemove}>Убрать range</button>}<button onClick={onClose}>Отмена</button><button className="primary" onClick={() => { const range = { min: toStored(min), max: toStored(max), step: toStored(step) }; if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(step) || range.min >= range.max || range.step <= 0 || range.min < -1e5 || range.max > 1e5) { setError('Укажите корректные границы и положительный шаг'); return; } onSave(range); }}>Сохранить</button></div>
  </div></div>;
}
type Pending = {
  kind: EffectKind;
  scope: "selection" | "current" | "all";
  ids: string[];
  editing?: string;
};
export default function App() {
  const [scene, setScene] = useState<Scene>(() => ensureVariables(structuredClone(initial))),
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
    [counts, setCounts] = useState([0, 0]),
    [editVariable, setEditVariable] = useState<string | null>(null),
    [editRange, setEditRange] = useState<string | null>(null),
    [editGraph, setEditGraph] = useState<string | null>(null),
    [variableMenu, setVariableMenu] = useState<{ id: string; left: number; top: number } | null>(null);
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
    s = ensureVariables(numberScene(s));
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
      s = syncVariables(current.current, s);
      validate(s);
      if (running) {
        for (const o of s.items) {
          const prior = current.current.items.find(p => p.id === o.id);
          if (!prior) continue;
          const changed: Patch = {};
          for (const field of fields(o)) if (readField(o, field.key) !== readField(prior, field.key)) {
            if (field.key.startsWith('vector.')) changed.vector = (o as Effect).vector;
            else if (field.key.startsWith('velocity.')) continue;
            else changed[field.key] = readField(o, field.key);
          }
          if (Object.keys(changed).length) simulation.current?.edit(o.id, changed);
        }
      }
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
      const view = { ...scene, variables: calculated.variables, items: scene.items.map(o => {
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
    let s: Scene = { ...current.current, items: [...current.current.items, o] };
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
      ...current.current,
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
      update(syncVariables(g.before, attachScene(current.current, g.id!, 10 / camera.current.scale)));
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
  const registryChange = (value: Scene | (() => Scene)) => {
    try {
      const next = typeof value === 'function' ? value() : value;
      validate(next);
      if (running) for (const o of next.items) {
        const prior = current.current.items.find(p => p.id === o.id);
        if (!prior) continue;
        const patch: Patch = {};
        for (const field of fields(o)) if (readField(o, field.key) !== readField(prior, field.key)) {
          if (field.key.startsWith('vector.')) patch.vector = (o as Effect).vector;
          else if (field.key.startsWith('velocity.')) continue;
          else patch[field.key] = readField(o, field.key);
        }
        if (Object.keys(patch).length) simulation.current?.edit(o.id, patch);
      }
      commit(next);
      return true;
    } catch (e) { tell(e instanceof Error ? e.message : String(e), true); return false; }
  };
  const updateVariable = (id: string, patch: Partial<Variable>) => {
    return registryChange({ ...current.current, variables: current.current.variables?.map(v => v.id === id ? { ...v, ...patch } : v) });
  };
  useEffect(() => {
    if (!variableMenu) return;
    const close = () => setVariableMenu(null);
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', key);
    };
  }, [variableMenu]);
  const chosen = scene.items.find((o) => o.id === selected),
    observedScene = showAuto && !running && preview?.source === scene ? preview.scene : scene,
    bodies = scene.items.filter(body),
    menuVariable = scene.variables?.find(v => v.id === variableMenu?.id);
  const field = (
    key: string,
    label: string,
    unit = "",
    min = -1e5,
    max = 1e5,
    disabled = false,
  ) => {
    const id = scene.bindings?.[bindingKey(chosen!.id, key)];
    const variable = scene.variables?.find(v => v.id === id);
    if (!variable) return null;
    const computed = key.startsWith('derived.');
    const compatible = bindableVariables(scene, chosen!.id, key);
    const shown = computed ? observedScene.items.find(o => o.id === chosen!.id) || chosen! : chosen!;
    return <div className="variable-field" key={chosen!.id + key}>
      <span className="field-label" title={label}>{label}</span>
      <span className="variable-select"><Symbol value={variable.symbol} />
        <select aria-label={`Переменная: ${label}`} title="Выбрать переменную" value={id} disabled={running || computed}
          onChange={e => registryChange(() => bindVariable(current.current, chosen!.id, key, e.target.value))}>
          {(computed ? [variable] : compatible).map(v => <option key={v.id} value={v.id}>{v.symbol}</option>)}
        </select>
      </span>
      <button className="visibility-button" title={variable.visible ? 'Скрыть в списке переменных' : 'Показать в списке переменных'} aria-label={`${variable.visible ? 'Скрыть' : 'Показать'} ${variable.symbol}`} aria-pressed={variable.visible} onClick={() => updateVariable(id!, { visible: !variable.visible, visibilityLocked: true })}>{variable.visible ? <EyeIcon /> : <EyeSlashIcon />}</button>
      <InlineNumber label={label} value={key.endsWith('.angle') && readField(shown, key.replace('.angle', '.magnitude')) === 0 ? displayValue(variable) : convertUnit(readField(shown, key), unit, displayUnit(variable))} disabled={disabled || computed} onChange={n => {
        const physical = convertUnit(n, displayUnit(variable), unit);
        if (physical < min || physical > max) { tell(`${label}: число от ${min} до ${max} ${unit}`, true); return; }
        if (key.startsWith('vector.') || key.startsWith('velocity.') || key === 'vx' || key === 'vy') registryChange(() => setVariable(current.current, id!, convertUnit(n, displayUnit(variable), variable.unit)));
        else change(chosen!.id, { [key]: physical, ...(geo(chosen!) && ['circle', 'pulley', 'bearing'].includes(chosen!.kind) && key === 'w' ? { h: physical } : {}) });
      }} />
      <UnitSelect variable={variable} onChange={unit => updateVariable(id!, { displayUnit: unit })} />
    </div>;
  };
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
                      {field('vector.magnitude', 'Модуль', chosen.kind === 'force' ? 'Н' : chosen.kind === 'velocity' ? 'м/с' : 'м/с²', 0)}
                      {field('vector.angle', 'Угол', '°', 0, 360)}
                      <details className="observed-fields"><summary>Проекции</summary>
                        {field('vector.x', 'Проекция X', chosen.kind === 'force' ? 'Н' : chosen.kind === 'velocity' ? 'м/с' : 'м/с²')}
                        {field('vector.y', 'Проекция Y', chosen.kind === 'force' ? 'Н' : chosen.kind === 'velocity' ? 'м/с' : 'м/с²')}
                      </details>
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
                      {chosen.kind !== "rod" && <div className="pair">
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
                          {field('velocity.magnitude', 'Модуль скорости', 'м/с', 0)}
                          {field('velocity.angle', 'Угол скорости', '°', 0, 360)}
                          <details className="observed-fields"><summary>Проекции скорости</summary>
                            {field('vx', 'Скорость X', 'м/с')}
                            {field('vy', 'Скорость Y', 'м/с')}
                          </details>
                          {field("omega", "Вращение ω", "рад/с")}
                          <details className="observed-fields"><summary>Вычисляемые величины</summary>{derivedFields.map(f => field(f.key, f.label, f.unit, -1e5, 1e5, true))}</details>
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
            <div className="section-heading"><h2>Переменные</h2><button title="Создать переменную" aria-label="Создать переменную" disabled={running || !!pending} onClick={() => setEditVariable('new')}><PlusIcon /></button></div>
            <div className="scroll variables">
              {scene.variables?.filter(v => v.visible).map(v => <div className="variable-card" key={v.id}>
                <div className="variable-card-line">
                  <Symbol value={v.symbol} />
                  <InlineNumber label={`Переменная ${v.symbol}`} value={displayValue(v, observedScene.variables?.find(x => x.id === v.id)?.value ?? v.value)} disabled={!!v.derived} onChange={n => registryChange(() => setVariable(current.current, v.id, convertUnit(n, displayUnit(v), v.unit)))} />
                  <UnitSelect variable={v} onChange={unit => updateVariable(v.id, { displayUnit: unit })} />
                  <button className="variable-menu-trigger" aria-label={`Действия с ${v.symbol}`} aria-haspopup="menu" aria-expanded={variableMenu?.id === v.id} title="Действия" onClick={e => {
                    if (variableMenu?.id === v.id) return setVariableMenu(null);
                    const rect = e.currentTarget.getBoundingClientRect();
                    setVariableMenu({ id: v.id, left: Math.max(8, Math.min(rect.right - 180, window.innerWidth - 188)), top: rect.bottom + 204 <= window.innerHeight ? rect.bottom + 4 : Math.max(8, rect.top - 204) });
                  }}><DotsThreeIcon /></button>
                </div>
                {v.range && <div className="variable-range"><input type="range" aria-label={`Диапазон ${v.symbol}`} min={v.range.min} max={v.range.max} step={v.range.step} value={Math.max(v.range.min, Math.min(v.range.max, v.value))} onChange={e => registryChange(() => setVariable(current.current, v.id, Number(e.target.value)))} /><button onClick={() => setEditRange(v.id)} title="Редактировать range">✎</button></div>}
                {v.graph && <button className="graph-link" onClick={() => setEditGraph(v.id)}>График зависимости ↗</button>}
              </div>)}
              {!scene.variables?.some(v => v.visible) && <p className="variables-empty">Покажите переменные кнопкой глаза в свойствах.</p>}
            </div>
          </section>
        </aside>
      </main>
      {variableMenu && menuVariable && createPortal(<div className="variable-menu-layer">
        <div className="variable-menu-dismiss" onClick={() => setVariableMenu(null)} />
        <div className="variable-menu-items" role="menu" style={{ left: variableMenu.left, top: variableMenu.top }} onClick={() => setVariableMenu(null)}>
          <button role="menuitem" onClick={() => { const all = current.current.variables || []; const nextId = `v${Math.max(0, ...all.map(x => Number(x.id.slice(1)) || 0)) + 1}`; const match = menuVariable.symbol.match(/^(.*?)(\d+)$/), prefix = match?.[1] || menuVariable.symbol; let index = Number(match?.[2]) || 1; while (all.some(x => x.symbol === `${prefix}${index}`)) index++; registryChange({ ...current.current, variables: [...all, { ...menuVariable, id: nextId, symbol: `${prefix}${index}`, auto: false, graph: menuVariable.graph ? structuredClone(menuVariable.graph) : undefined }] }); }}>Дублировать</button>
          <button role="menuitem" disabled={!!menuVariable.derived} onClick={() => setEditVariable(menuVariable.id)}>Изменить</button>
          <button role="menuitem" onClick={() => registryChange(removeVariable(current.current, menuVariable.id))}>Удалить</button>
          <button role="menuitem" disabled={!!menuVariable.derived} onClick={() => setEditRange(menuVariable.id)}>{menuVariable.range ? 'Редактировать range' : 'Сделать range'}</button>
          <button role="menuitem" disabled={!!menuVariable.derived} onClick={() => setEditGraph(menuVariable.id)}>{menuVariable.graph ? 'Редактировать график' : 'Сделать график'}</button>
          {menuVariable.graph && <button role="menuitem" onClick={() => updateVariable(menuVariable.id, { graph: undefined })}>Убрать график</button>}
        </div>
      </div>, document.body)}
      {editVariable && <VariableEditor key={editVariable} variable={scene.variables?.find(v => v.id === editVariable)} suggestedSymbol={newSymbol(scene.variables)} onClose={() => setEditVariable(null)} onSave={draft => {
        try { return registryChange(saveVariable(current.current, { ...draft, ...(editVariable === 'new' ? {} : { id: editVariable }) })) ? null : 'Не удалось сохранить переменную'; }
        catch (error) { return error instanceof Error ? error.message : String(error); }
      }} />}
      {editRange && scene.variables?.find(v => v.id === editRange) && <RangeEditor key={editRange} variable={scene.variables.find(v => v.id === editRange)!} onClose={() => setEditRange(null)} onSave={range => { updateVariable(editRange, { range }); setEditRange(null); }} onRemove={() => { updateVariable(editRange, { range: undefined }); setEditRange(null); }} />}
      {editGraph && scene.variables?.find(v => v.id === editGraph) && <GraphEditor key={editGraph} variable={scene.variables.find(v => v.id === editGraph)!} variables={scene.variables} onClose={() => setEditGraph(null)} onSave={graph => { if (updateVariable(editGraph, { graph })) setEditGraph(null); }} />}
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
