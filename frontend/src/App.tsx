import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as PE, ReactNode } from "react";
import {
  Checkbox as AriaCheckbox,
  ComboBox,
  Dialog,
  Disclosure,
  DisclosurePanel,
  FileTrigger,
  Form,
  Group as AriaGroup,
  Heading,
  Input as AriaInput,
  Label,
  ListBox,
  ListBoxItem as ComboBoxItem,
  Modal,
  ModalOverlay,
  Popover,
  Slider,
  SliderThumb,
  SliderTrack,
  Tooltip,
  TooltipTrigger,
} from "react-aria-components";
import { FolderOpenIcon } from "@phosphor-icons/react/dist/csr/FolderOpen";
import { FloppyDiskIcon } from "@phosphor-icons/react/dist/csr/FloppyDisk";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react/dist/csr/ArrowCounterClockwise";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/dist/csr/ArrowClockwise";
import { GridFourIcon } from "@phosphor-icons/react/dist/csr/GridFour";
import { CornersOutIcon } from "@phosphor-icons/react/dist/csr/CornersOut";
import { ArrowDownIcon } from "@phosphor-icons/react/dist/csr/ArrowDown";
import { CursorIcon } from "@phosphor-icons/react/dist/csr/Cursor";
import { SlidersHorizontalIcon } from "@phosphor-icons/react/dist/csr/SlidersHorizontal";
import { ChartLineIcon } from "@phosphor-icons/react/dist/csr/ChartLine";
import { NumberSquareOneIcon } from "@phosphor-icons/react/dist/csr/NumberSquareOne";
import { CopySimpleIcon } from "@phosphor-icons/react/dist/csr/CopySimple";
import { PlayIcon } from "@phosphor-icons/react/dist/csr/Play";
import { StopIcon } from "@phosphor-icons/react/dist/csr/Stop";
import { TrashIcon } from "@phosphor-icons/react/dist/csr/Trash";
import { FileIcon } from "@phosphor-icons/react/dist/csr/File";
import { CheckIcon } from "@phosphor-icons/react/dist/csr/Check";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { ListBulletsIcon } from "@phosphor-icons/react/dist/csr/ListBullets";
import { EyeIcon } from "@phosphor-icons/react/dist/csr/Eye";
import { EyeSlashIcon } from "@phosphor-icons/react/dist/csr/EyeSlash";
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
  itemLabel,
  local,
  validate,
  serializeProject,
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
import { allowedUnits, bindableVariables, bindVariable, bindingKey, convertUnit, derivedFields, displayUnit, displayValue, ensureVariables, fields, knownUnit, readField, removeVariable, saveVariable, setVariable, syncVariables, unitChoices, variableMode } from './variables';
import type { Variable } from './variables';
import { GraphEditor, VariableGraph } from './GraphEditor';
import { Button as AppButton, SelectControl } from './ui';
import "./App.css";

type ToolKind = Kind | "select";
const toolShortcuts: Record<ToolKind, string> = {
  select: "V", rect: "R", circle: "C", bearing: "B", spring: "S", rope: "T",
  pulley: "P", force: "F", acceleration: "A", velocity: "U", surface: "H", rod: "L",
};
const toolDescriptions: Record<Kind, string> = {
  rect: "Добавить прямоугольное тело", circle: "Добавить круглое тело", bearing: "Добавить опору",
  spring: "Соединить тела пружиной", rope: "Соединить тела нитью", pulley: "Добавить блок",
  force: "Добавить силу и выбрать тела", acceleration: "Добавить ускорение телам",
  velocity: "Задать начальную скорость", surface: "Добавить поверхность", rod: "Добавить рычаг",
};
const panelMinimums = { left: 180, right: 200 } as const;
const panelMaximums = { left: 460, right: 480 } as const;
function fitPanelWidths(preferences: { left: number; right: number }, layoutWidth: number) {
  const widths = { ...preferences };
  let excess = widths.left + widths.right - Math.max(panelMinimums.left + panelMinimums.right, layoutWidth - 390);
  if (excess > 0) {
    for (const panel of ["right", "left"] as const) {
      const reduction = Math.min(excess, widths[panel] - panelMinimums[panel]);
      widths[panel] -= reduction;
      excess -= reduction;
    }
  }
  return widths;
}
const format = (n: number) => Number(n.toPrecision(6)).toString();
function Tool({
  label,
  children,
  onClick,
  disabled = false,
  active = false,
  className = "",
  tooltip,
  shortcut,
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  className?: string;
  tooltip?: string;
  shortcut?: string;
}) {
  const button = (
    <AppButton
      className={`tool ${active ? "active" : ""} ${className}`}
      title={tooltip ? undefined : label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </AppButton>
  );
  return tooltip ? <TooltipTrigger delay={350}>
    {button}
    <Tooltip className="tool-tooltip toolbar-tooltip" placement="bottom">
      <strong>{label}{shortcut && <kbd>{shortcut}</kbd>}</strong>
      <span>{tooltip}</span>
    </Tooltip>
  </TooltipTrigger> : button;
}
function CanvasToolButton({ label, description, shortcut, active, disabled, onClick, children }: {
  label: string;
  description: string;
  shortcut: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setOpen(true), 400);
  };
  const hide = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
    setOpen(false);
  };
  useEffect(() => () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); }, []);
  return <TooltipTrigger isOpen={open} onOpenChange={setOpen} delay={400}>
    <AppButton className={`canvas-tool ${active ? "active" : ""}`} aria-label={label} aria-pressed={active} disabled={disabled} onClick={onClick} onHoverStart={show} onHoverEnd={hide}>
      {children}
    </AppButton>
    <Tooltip className="tool-tooltip" placement="right"><strong>{label} <kbd>{shortcut}</kbd></strong><span>{description}</span></Tooltip>
  </TooltipTrigger>;
}
function ResizeHandle({ name, width, min, max, reverse = false, className = "", onResize }: { name: string; width: number; min: number; max: number; reverse?: boolean; className?: string; onResize: (width: number) => void }) {
  const drag = useRef<{ x: number; width: number } | null>(null);
  const resize = (value: number) => onResize(Math.max(min, Math.min(max, value)));
  return <div className={`resize-handle ${className}`} role="separator" aria-orientation="vertical" aria-label={`Изменить ширину: ${name}`} aria-valuemin={min} aria-valuemax={max} aria-valuenow={Math.round(width)} tabIndex={0}
    onPointerDown={e => { e.preventDefault(); drag.current = { x: e.clientX, width }; e.currentTarget.setPointerCapture(e.pointerId); }}
    onPointerMove={e => { if (drag.current) resize(drag.current.width + (e.clientX - drag.current.x) * (reverse ? -1 : 1)); }}
    onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
    onKeyDown={e => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); const step = e.key === "ArrowRight" ? 12 : -12; resize(width + step * (reverse ? -1 : 1)); } }} />;
}
function InlineNumber({ label, value, disabled, onChange }: { label: string; value: number; disabled?: boolean; onChange: (value: number) => boolean }) {
  const [draft, setDraft] = useState(format(value));
  const [bad, setBad] = useState(false);
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) { setDraft(format(value)); setBad(false); } }, [value]);
  return <AriaInput className={bad ? 'invalid' : ''} aria-label={label} aria-invalid={bad} value={draft} readOnly={disabled} inputMode="decimal"
    onFocus={() => { focused.current = true; }} onChange={e => { setDraft(e.target.value); setBad(false); }}
    onBlur={() => { focused.current = false; const n = Number(draft.replace(',', '.')); if (!draft.trim() || !Number.isFinite(n) || (n !== value && !onChange(n))) { setDraft(format(value)); setBad(true); } }}
    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setDraft(format(value)); setBad(false); e.currentTarget.blur(); } }} />;
}
function Symbol({ value }: { value: string }) { return <span className="symbol">{value[0]}<sub>{value.slice(1)}</sub></span>; }
function UnitSelect({ variable, disabled = false, onChange }: { variable: Variable; disabled?: boolean; onChange: (unit: string) => void }) {
  const options = unitChoices(variable.unit);
  return options.length > 1 ? <SelectControl className="unit-select" label={`Единица ${variable.symbol}`} title="Единица измерения" value={displayUnit(variable)} disabled={disabled} onChange={onChange} options={options.map(unit => ({ value: unit, label: unit, text: unit }))} /> : <small className="unit-static">{variable.unit}</small>;
}
function UnitCombobox({ value, onChange }: { value: string; onChange: (unit: string) => void }) {
  const search = value.replace(/[HhNn]/g, 'Н');
  const items = allowedUnits.filter(unit => unit.startsWith(search));
  return <ComboBox className="unit-entry unit-combobox" inputValue={value} onInputChange={onChange} onChange={unit => onChange(String(unit ?? '') === '__empty__' ? '' : String(unit ?? ''))} allowsCustomValue menuTrigger="input">
      <Label>Единица измерения</Label>
      <AriaGroup className="unit-combobox-input">
        <AriaInput maxLength={30} placeholder="Без единицы" />
        <AppButton slot="trigger" className="combobox-chevron" aria-label="Показать единицы" type="button">
          <svg className="select-chevron" aria-hidden="true" viewBox="0 0 12 12"><path d="m3.1 4.6 2.9 2.8 2.9-2.8" /></svg>
        </AppButton>
      </AriaGroup>
      <Popover className="unit-options"><ListBox className="unit-options-list" aria-label="Доступные единицы">
        {items.map(unit => <ComboBoxItem key={unit || 'none'} id={unit || '__empty__'} textValue={unit || 'Без единицы'}>{unit || 'Без единицы'}</ComboBoxItem>)}
      </ListBox></Popover>
  </ComboBox>;
}
function newSymbol(variables: Variable[] = []) { let n = 1; while (variables.some(v => v.symbol === `q${n}`)) n++; return `q${n}`; }
function VariableEditor({ variable, suggestedSymbol, onSave, onClose }: { variable?: Variable; suggestedSymbol: string; onSave: (draft: { symbol: string; value: number; unit: string }) => string | null; onClose: () => void }) {
  const [symbol, setSymbol] = useState(variable?.symbol ?? suggestedSymbol);
  const [value, setValue] = useState(String(variable ? displayValue(variable) : 0));
  const [unit, setUnit] = useState(variable ? displayUnit(variable) : '');
  const [error, setError] = useState('');
  return <ModalOverlay className="editor-backdrop" isOpen isDismissable onOpenChange={open => { if (!open) onClose(); }}><Modal><Dialog className="variable-dialog" aria-label={variable ? `Изменить ${variable.symbol}` : 'Новая переменная'}><Form className="variable-editor" onSubmit={e => {
    e.preventDefault();
    const n = Number(value.replace(',', '.'));
    if (!value.trim() || !Number.isFinite(n)) { setError('Введите числовое значение'); return; }
    if (!knownUnit(unit) && unit !== (variable && displayUnit(variable))) { setError('Выберите единицу из списка'); return; }
    const error = onSave({ symbol, value: n, unit });
    if (error) setError(error); else onClose();
  }}>
    <Heading slot="title" level={3}>{variable ? `Переменная ${variable.symbol}` : 'Новая переменная'}</Heading>
    <label>Литера <AriaInput aria-label="Литера" value={symbol} maxLength={40} onChange={e => setSymbol(e.target.value)} autoFocus /></label>
    <label>{variable && variableMode(variable) === 'graph' ? 'Значение задаётся графиком' : variable && variableMode(variable) === 'range' ? 'Значение задаётся диапазоном' : 'Значение'} <AriaInput aria-label="Значение" value={value} readOnly={!!variable && variableMode(variable) !== 'number'} inputMode="decimal" onChange={e => setValue(e.target.value)} /></label>
    <UnitCombobox value={unit} onChange={next => { setUnit(next); setError(''); }} />
    {error && <p className="range-error">{error}</p>}
    <div className="range-actions"><AppButton type="button" onClick={onClose}>Отмена</AppButton><AppButton type="submit" className="primary">Сохранить</AppButton></div>
  </Form></Dialog></Modal></ModalOverlay>;
}
function RangeEditor({ variable, onSave, onRemove, onClose }: { variable: Variable; onSave: (range: NonNullable<Variable['range']>) => void; onRemove?: () => void; onClose: () => void }) {
  const unit = displayUnit(variable), toShown = (n: number) => convertUnit(n, variable.unit, unit), toStored = (n: number) => convertUnit(n, unit, variable.unit);
  const [min, setMin] = useState(toShown(variable.range?.min ?? Math.min(0, variable.value)));
  const [max, setMax] = useState(toShown(variable.range?.max ?? Math.max(10, variable.value + 1)));
  const [step, setStep] = useState(toShown(variable.range?.step ?? .1));
  const [error, setError] = useState('');
  const save = () => { const range = { min: toStored(min), max: toStored(max), step: toStored(step) }; if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(step) || range.min >= range.max || range.step <= 0 || range.min < -1e5 || range.max > 1e5) { setError('Проверьте границы и положительный шаг'); return; } onSave(range); };
  return <form className="range-inline-editor" aria-label={`Диапазон ${variable.symbol}`} onSubmit={event => { event.preventDefault(); save(); }}>
    <div className="range-inline-fields">
      <label>От <AriaInput type="number" step="any" value={String(min)} onChange={e => setMin(Number(e.target.value))} /></label>
      <label>До <AriaInput type="number" step="any" value={String(max)} onChange={e => setMax(Number(e.target.value))} /></label>
      <label>Шаг <AriaInput type="number" step="any" value={String(step)} onChange={e => setStep(Number(e.target.value))} /></label>
      <span className="range-inline-unit">{unit}</span>
    </div>
    {error && <p className="range-error">{error}</p>}
    <div className="range-inline-actions">
      {variable.range && onRemove && <AppButton type="button" onClick={onRemove}>Убрать</AppButton>}
      {variable.range && <AppButton type="button" onClick={onClose}>Отмена</AppButton>}
      <AppButton type="submit" className="primary">Сохранить</AppButton>
    </div>
  </form>;
}
function SaveAsDialog({ onSave, onClose }: { onSave: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState("mechanics");
  return <ModalOverlay className="editor-backdrop" isOpen isDismissable onOpenChange={open => { if (!open) onClose(); }}><Modal><Dialog className="save-dialog-dialog" aria-label="Сохранить проект как"><Form className="save-dialog" onSubmit={e => { e.preventDefault(); onSave(name); }}>
    <Heading slot="title" level={3}>Сохранить проект как</Heading>
    <label>Название файла <div className="save-name"><AriaInput value={name} onChange={e => setName(e.target.value)} autoFocus /><span>.physics.json</span></div></label>
    <div className="range-actions"><AppButton type="button" onClick={onClose}>Отмена</AppButton><AppButton type="submit" className="primary">Сохранить</AppButton></div>
  </Form></Dialog></Modal></ModalOverlay>;
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
    [activeTool, setActiveTool] = useState<ToolKind>("select"),
    [saveDialog, setSaveDialog] = useState(false),
    [panelWidthPrefs, setPanelWidthPrefs] = useState(() => window.innerWidth <= 1100 ? { left: 190, right: 230 } : { left: 250, right: 240 }),
    [layoutWidth, setLayoutWidth] = useState(() => window.innerWidth),
    [layoutHeight, setLayoutHeight] = useState(() => window.innerHeight),
    [responsivePanel, setResponsivePanel] = useState<"variables" | "inspector" | null>(null),
    [editVariable, setEditVariable] = useState<string | null>(null),
    [editGraph, setEditGraph] = useState<string | null>(null),
    [editingRange, setEditingRange] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null),
    mainLayout = useRef<HTMLElement>(null),
    current = useRef(scene),
    display = useRef(scene),
    snapshot = useRef<Scene | null>(null),
    simulation = useRef<Simulation | null>(null),
    past = useRef<Scene[]>([]),
    future = useRef<Scene[]>([]),
    metrics = useRef<Metrics | null>(null),
    noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const panelWidths = fitPanelWidths(panelWidthPrefs, layoutWidth);
  const inspectorAsDrawer = layoutWidth <= 800 || layoutWidth / Math.max(1, layoutHeight) <= 4 / 3;
  const camera = useRef<Camera>({ x: 0, y: 0.7, scale: 90 }),
    cameraTarget = useRef<Camera>({ x: 0, y: 0.7, scale: 90 }),
    state = useRef({ selected, grid, pending, running, showAuto }),
    hover = useRef<string | null>(null),
    space = useRef(false),
    drag = useRef<{ id: string; x: number; y: number; local: Vec } | null>(null);
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
  const resizePanel = (panel: keyof typeof panelMinimums, width: number) => {
    const availableWidth = mainLayout.current?.clientWidth ?? window.innerWidth,
      drawer = panel === "right" ? inspectorAsDrawer : availableWidth <= 760,
      min = Math.min(panelMinimums[panel], Math.max(120, availableWidth - 48));
    setPanelWidthPrefs(current => {
      let max: number;
      if (drawer) max = Math.min(panelMaximums[panel], availableWidth - 48);
      else if (panel === "left" && availableWidth <= 800) max = Math.min(panelMaximums.left, availableWidth - 384);
      else {
        const fitted = fitPanelWidths(current, availableWidth),
          others = fitted.left + fitted.right - fitted[panel];
        max = Math.min(panelMaximums[panel], availableWidth - 390 - others);
      }
      return { ...current, [panel]: Math.max(min, Math.min(max, width)) };
    });
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
          if (body(o) && body(prior) && JSON.stringify(o.trajectory) !== JSON.stringify(prior.trajectory)) changed.trajectory = o.trajectory;
          if (effect(o) && effect(prior) && o.gravity !== prior.gravity) changed.gravity = o.gravity;
          if (Object.keys(changed).length) simulation.current?.edit(o.id, changed);
        }
      }
      commit(s);
      return true;
    } catch (e) {
      tell(e instanceof Error ? e.message : "Неверные параметры", true);
      return false;
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
    setEditingRange(null);
    setEditGraph(null);
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
    const element = mainLayout.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setLayoutWidth(element.clientWidth));
    const updateHeight = () => setLayoutHeight(window.innerHeight);
    observer.observe(element);
    window.addEventListener("resize", updateHeight);
    return () => { observer.disconnect(); window.removeEventListener("resize", updateHeight); };
  }, []);
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
      if (e.target instanceof Element && e.target.closest('[role="option"], [role="listbox"], [role="dialog"], [aria-haspopup="listbox"][aria-expanded="true"]')) return;
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
        setResponsivePanel(null);
        setActiveTool("select");
        setPending(null);
        setNotice(null);
        gesture.current = null;
        drag.current = null;
      }
      if (e.key === "Home") centerView();
      if (!e.ctrlKey && !e.metaKey && !e.altKey && !running && !pending) {
        const tool = (Object.keys(toolShortcuts) as ToolKind[]).find(id => toolShortcuts[id] === e.key.toUpperCase());
        if (tool) setActiveTool(tool);
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
    if (running || pending) return;
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
          drag.current = { id: o.id, ...p, local: local(o, p) };
      } else setSelected(null);
      return;
    }
    if (activeTool !== "select") {
      if (["force", "velocity", "acceleration"].includes(activeTool)) setActiveTool("select");
      add(activeTool, p);
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
    setEditVariable(null);
    setEditingRange(null);
    setEditGraph(null);
    setActiveTool("select");
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
  const save = (name: string) => {
    const s = validate(
        running && snapshot.current ? snapshot.current : current.current,
      ),
      url = URL.createObjectURL(
      new Blob([serializeProject(s)], { type: "application/json" }),
      ),
      a = document.createElement("a");
    const base = name.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/\.+$/, "") || "mechanics";
    a.href = url;
    a.download = base.endsWith(".physics.json") ? base : `${base.replace(/\.json$/i, "")}.physics.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setSaveDialog(false);
  };
  const openProject = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > 2e6) throw Error("Файл больше 2 МБ");
      const next = validate(JSON.parse(await file.text()));
      commit(next);
      setEditingRange(null);
      setEditGraph(null);
      setSelected(null);
      centerView();
    } catch (error) {
      tell(error instanceof Error ? error.message : "Не удалось открыть проект", true);
    } finally {
      setBusy(false);
    }
  };
  const registryChange = (value: Scene | (() => Scene)) => {
    if (running || simulation.current) return false;
    try {
      const next = typeof value === 'function' ? value() : value;
      validate(next);
      commit(next);
      return true;
    } catch (e) { tell(e instanceof Error ? e.message : String(e), true); return false; }
  };
  const updateVariable = (id: string, patch: Partial<Variable>) => {
    return registryChange({ ...current.current, variables: current.current.variables?.map(v => v.id === id ? { ...v, ...patch } : v) });
  };
  const setVariableMode = (variable: Variable, mode: 'number' | 'range' | 'graph') => {
    const patch: Partial<Variable> = { mode };
    if (mode === 'range' && !variable.range) {
      const radius = Math.max(1, Math.abs(variable.value) * 0.1);
      patch.range = { min: Math.max(-1e5, variable.value - radius), max: Math.min(1e5, variable.value + radius), step: radius / 100 };
    }
    if (mode === 'graph' && !variable.graph) patch.graph = { source: 'time', points: [{ x: 0, y: variable.value }, { x: 10, y: variable.value }] };
    if (updateVariable(variable.id, patch)) {
      setEditingRange(null);
      setEditGraph(null);
    }
  };
  const duplicateVariable = (variable: Variable) => {
    const all = current.current.variables || [],
      id = `v${Math.max(0, ...all.map(v => Number(v.id.slice(1)) || 0)) + 1}`,
      match = variable.symbol.match(/^(.*?)(\d+)$/),
      prefix = match?.[1] || variable.symbol;
    let index = Number(match?.[2]) || 1;
    while (all.some(v => v.symbol === `${prefix}${index}`)) index++;
    registryChange({ ...current.current, variables: [...all, { ...variable, id, symbol: `${prefix}${index}`, auto: false, graph: variable.graph ? structuredClone(variable.graph) : undefined }] });
  };
  const chosen = scene.items.find((o) => o.id === selected),
    observedScene = showAuto && !running && preview?.source === scene ? preview.scene : scene,
    bodies = scene.items.filter(body);
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
        <SelectControl className="variable-bind-select" label={`Переменная: ${label}`} title="Выбрать переменную" value={id!} disabled={running || computed}
          onChange={next => registryChange(() => bindVariable(current.current, chosen!.id, key, next))}
          options={(computed ? [variable] : compatible).map(v => ({ value: v.id, label: <Symbol value={v.symbol} />, text: v.symbol }))} />
      </span>
      <AppButton className="visibility-button" title={variable.visible ? 'Скрыть в списке переменных' : 'Показать в списке переменных'} aria-label={`${variable.visible ? 'Скрыть' : 'Показать'} ${variable.symbol}`} aria-pressed={variable.visible} disabled={running} onClick={() => updateVariable(id!, { visible: !variable.visible, visibilityLocked: true })}>{variable.visible ? <EyeIcon /> : <EyeSlashIcon />}</AppButton>
      <InlineNumber label={label} value={key.endsWith('.angle') && readField(shown, key.replace('.angle', '.magnitude')) === 0 ? displayValue(variable) : convertUnit(readField(shown, key), unit, displayUnit(variable))} disabled={disabled || computed || variableMode(variable) !== 'number' || (running && (key.startsWith('vector.') || key.startsWith('velocity.') || key === 'vx' || key === 'vy'))} onChange={n => {
        const physical = convertUnit(n, displayUnit(variable), unit);
        if (physical < min || physical > max) { tell(`${label}: число от ${min} до ${max} ${unit}`, true); return false; }
        if (key.startsWith('vector.') || key.startsWith('velocity.') || key === 'vx' || key === 'vy') return registryChange(() => setVariable(current.current, id!, convertUnit(n, displayUnit(variable), variable.unit)));
        return change(chosen!.id, key === 'radius' ? { w: physical * 2, h: physical * 2 } : { [key]: physical });
      }} />
      <UnitSelect variable={variable} disabled={running} onChange={unit => updateVariable(id!, { displayUnit: unit })} />
    </div>;
  };
  return (
    <div className="app">
      <nav className="toolbar" aria-label="Инструменты">
        <AppButton className="responsive-panel-toggle variables-toggle" aria-label="Открыть переменные" title="Переменные" aria-controls="variables-panel" aria-expanded={responsivePanel === "variables"} onClick={() => setResponsivePanel(responsivePanel === "variables" ? null : "variables")}><ListBulletsIcon /></AppButton>
        <AppButton className="responsive-panel-toggle inspector-toggle" aria-label="Открыть свойства и объекты" title="Свойства и объекты" aria-controls="inspector-panel" aria-expanded={responsivePanel === "inspector"} onClick={() => setResponsivePanel(responsivePanel === "inspector" ? null : "inspector")}><SlidersHorizontalIcon /></AppButton>
        <Tool
          label="Новый проект"
          disabled={running || !!pending}
          onClick={() => {
            commit(structuredClone(initial));
            setEditingRange(null);
            setEditGraph(null);
            setSelected("2");
            centerView();
          }}
        >
          <FileIcon />
        </Tool>
        <FileTrigger acceptedFileTypes={[".json", ".physics.json"]} onSelect={openProject}>
          <Tool label="Открыть проект" disabled={running || busy || !!pending}><FolderOpenIcon /></Tool>
        </FileTrigger>
        <Tool label="Сохранить как" onClick={() => setSaveDialog(true)}>
          <FloppyDiskIcon />
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
          label="Сетка"
          tooltip="Показывать сетку и включать привязку перемещения с шагом 0,1 м."
          active={grid}
          onClick={() => setGrid(!grid)}
        >
          <GridFourIcon />
        </Tool>
        <Tool label="Центрировать сцену" tooltip="Вписать все объекты сцены в область просмотра." shortcut="Home" onClick={centerView}>
          <CornersOutIcon />
        </Tool>
        <Tool label="Показывать векторы" tooltip="Автоматически показывать силы, скорости и ускорения." active={showAuto} onClick={() => setShowAuto(!showAuto)}>
          <ArrowDownIcon />
        </Tool>
        <span className="spacer" />
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
      <main ref={mainLayout} className={`${responsivePanel === "variables" ? "variables-drawer-open" : ""} ${responsivePanel === "inspector" ? "inspector-drawer-open" : ""}`} style={{ "--left-panel-width": `${panelWidths.left}px`, "--right-panel-width": `${panelWidths.right}px`, "--left-drawer-width": `${panelWidthPrefs.left}px`, "--right-drawer-width": `${panelWidthPrefs.right}px` } as CSSProperties}>
        {responsivePanel && <AppButton className="panel-scrim" aria-label="Закрыть панель" onClick={() => setResponsivePanel(null)} />}
        <aside id="variables-panel" className={`left variables-panel ${responsivePanel === "variables" ? "drawer-open" : ""}`}>
          <section>
            <div className="section-heading"><h2>Переменные</h2><AppButton className="drawer-close" title="Закрыть панель" aria-label="Закрыть панель переменных" onClick={() => setResponsivePanel(null)}><XIcon /></AppButton><AppButton title="Создать переменную" aria-label="Создать переменную" disabled={running || !!pending} onClick={() => setEditVariable('new')}><PlusIcon /></AppButton></div>
            <div className="scroll variables">
              {scene.variables?.filter(v => v.visible).map(v => <div className="variable-card" key={v.id}>
                <div className="variable-card-line">
                  <Symbol value={v.symbol} />
                  <InlineNumber label={`Переменная ${v.symbol}`} value={displayValue(v, observedScene.variables?.find(x => x.id === v.id)?.value ?? v.value)} disabled={running || !!v.derived || variableMode(v) !== 'number'} onChange={n => registryChange(() => setVariable(current.current, v.id, convertUnit(n, displayUnit(v), v.unit)))} />
                  <UnitSelect variable={v} disabled={running} onChange={unit => updateVariable(v.id, { displayUnit: unit })} />
                </div>
                <div className="variable-actions">
                  <AppButton className="variable-tab" disabled={running || !!v.derived} title="Числовой режим" aria-label={`Числовой режим ${v.symbol}`} aria-pressed={variableMode(v) === 'number'} onClick={() => setVariableMode(v, 'number')}><NumberSquareOneIcon weight="fill" /></AppButton>
                  <AppButton className="variable-tab" disabled={running || !!v.derived} title="Диапазон" aria-label={`Диапазон ${v.symbol}`} aria-pressed={variableMode(v) === 'range'} onClick={() => setVariableMode(v, 'range')}><SlidersHorizontalIcon weight="fill" /></AppButton>
                  <AppButton className="variable-tab" disabled={running || !!v.derived} title="График зависимости" aria-label={`График зависимости ${v.symbol}`} aria-pressed={variableMode(v) === 'graph'} onClick={() => setVariableMode(v, 'graph')}><ChartLineIcon weight="fill" /></AppButton>
                  <span className="variable-actions-spacer" />
                  <AppButton disabled={running} title="Дублировать" aria-label={`Дублировать ${v.symbol}`} onClick={() => duplicateVariable(v)}><CopySimpleIcon weight="fill" /></AppButton>
                  <AppButton disabled={running} title="Удалить" aria-label={`Удалить ${v.symbol}`} onClick={() => { if (editingRange === v.id) setEditingRange(null); if (editGraph === v.id) setEditGraph(null); registryChange(removeVariable(current.current, v.id)); }}><TrashIcon weight="fill" /></AppButton>
                </div>
                {variableMode(v) === 'range' && <div className="variable-tool-content" aria-label={`Диапазон ${v.symbol}`}>
                  {editingRange === v.id || !v.range ? <RangeEditor key={`${v.id}-range`} variable={v} onClose={() => setEditingRange(null)} onSave={range => { if (updateVariable(v.id, { range })) setEditingRange(null); }} onRemove={() => { updateVariable(v.id, { range: undefined, mode: 'number' }); setEditingRange(null); }} /> : <>
                    <Slider className="variable-range" aria-label={`Диапазон ${v.symbol}`} minValue={v.range.min} maxValue={v.range.max} step={v.range.step} value={Math.max(v.range.min, Math.min(v.range.max, observedScene.variables?.find(x => x.id === v.id)?.value ?? v.value))} isDisabled={running} onChange={next => registryChange(() => setVariable(current.current, v.id, Array.isArray(next) ? next[0] : next))}><SliderTrack><SliderThumb /></SliderTrack></Slider>
                    <div className="variable-range-meta"><span>{displayValue(v, v.range.min)} – {displayValue(v, v.range.max)} {displayUnit(v)}</span><AppButton disabled={running || !!v.derived} className="range-inline-config" onClick={() => setEditingRange(v.id)}>Границы</AppButton></div>
                  </>}
                </div>}
                {variableMode(v) === 'graph' && <div className="variable-graph-preview"><VariableGraph key={v.id} variable={v} variables={scene.variables || []} onRequestEdit={() => setEditGraph(v.id)} /></div>}
              </div>)}
              {!scene.variables?.some(v => v.visible) && <p className="variables-empty">Покажите переменные кнопкой глаза в свойствах.</p>}
            </div>
          </section>
        </aside>
        <ResizeHandle className="variables-resize" name="переменных" width={layoutWidth <= 760 && responsivePanel === "variables" ? Math.min(panelWidthPrefs.left, layoutWidth - 48) : panelWidths.left} min={layoutWidth <= 760 && responsivePanel === "variables" ? Math.min(panelMinimums.left, Math.max(120, layoutWidth - 48)) : panelMinimums.left} max={layoutWidth <= 760 && responsivePanel === "variables" ? Math.min(panelMaximums.left, layoutWidth - 48) : panelMaximums.left} onResize={width => resizePanel("left", width)} />
        <aside className="tool-panel" aria-label="Инструменты">
          <div className="scroll tool-list">
            <CanvasToolButton label="Выделение" description="Выбирать, перемещать и настраивать объекты" shortcut={toolShortcuts.select} active={activeTool === "select"} disabled={running || !!pending} onClick={() => setActiveTool("select")}><CursorIcon /></CanvasToolButton>
            {kinds.map(kind => <CanvasToolButton key={kind} label={names[kind]} description={toolDescriptions[kind]} shortcut={toolShortcuts[kind]} active={activeTool === kind} disabled={running || !!pending} onClick={() => setActiveTool(kind)}><ComponentIcon kind={kind} /></CanvasToolButton>)}
          </div>
        </aside>
        <div className="panel-divider" aria-hidden="true" />
        <div className="workspace">
          <canvas
            ref={canvas}
            tabIndex={0}
            aria-label="Чертёж механической системы"
            style={{ cursor: activeTool === "select" ? undefined : "crosshair" }}
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerUp}
            onPointerCancel={pointerUp}
          />
          {pending && (
            <div
              className="assignment"
              role="dialog"
              aria-label="Назначение воздействия"
            >
              <strong>{names[pending.kind]}</strong>
              <SelectControl label="Получатели воздействия" value={pending.scope} onChange={scope => setPending({ ...pending, scope: scope as Pending["scope"] })} options={[
                { value: "selection", label: `Выбранные тела (${pending.ids.length})`, text: `Выбранные тела (${pending.ids.length})` },
                { value: "current", label: "Все текущие тела", text: "Все текущие тела" },
                { value: "all", label: "Все тела, включая будущие", text: "Все тела, включая будущие" },
              ]} />
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
        <ResizeHandle className="inspector-resize" name="свойств и объектов" width={inspectorAsDrawer && responsivePanel === "inspector" ? Math.min(panelWidthPrefs.right, layoutWidth - 48) : panelWidths.right} min={inspectorAsDrawer && responsivePanel === "inspector" ? Math.min(panelMinimums.right, Math.max(120, layoutWidth - 48)) : panelMinimums.right} max={inspectorAsDrawer && responsivePanel === "inspector" ? Math.min(panelMaximums.right, layoutWidth - 48) : panelMaximums.right} reverse onResize={width => resizePanel("right", width)} />
        <aside id="inspector-panel" className={`right ${responsivePanel === "inspector" ? "drawer-open" : ""}`}>
          <section>
            <div className="section-heading"><h2>{pending ? "Назначение" : "Свойства"}</h2><AppButton className="drawer-close" title="Закрыть панель" aria-label="Закрыть свойства и объекты" onClick={() => setResponsivePanel(null)}><XIcon /></AppButton></div>
            <div className="scroll properties">
              {pending ? (
                <div className="target-list">
                  {bodies.map((b) => <AriaCheckbox className="check" key={b.id} isSelected={pending.scope !== "selection" || pending.ids.includes(b.id)} onChange={() => choose(b.id)}><span className="checkbox-indicator" aria-hidden="true" />{itemLabel(b)}</AriaCheckbox>)}
                </div>
              ) : chosen ? (
                <>
                  <div className="property-title">
                    <ComponentIcon kind={chosen.kind} />
                    <span>{names[chosen.kind]}</span>
                    {chosen.kind !== "surface" && <AriaInput
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
                    />}
                  </div>
                  {effect(chosen) ? (
                    <>
                      {field('vector.magnitude', 'Модуль', chosen.kind === 'force' ? 'Н' : chosen.kind === 'velocity' ? 'м/с' : 'м/с²', 0)}
                      {field('vector.angle', 'Угол', '°', 0, 360)}
                      <Disclosure className="observed-fields"><Heading level={3}><AppButton slot="trigger">Проекции</AppButton></Heading><DisclosurePanel>
                        {field('vector.x', 'Проекция X', chosen.kind === 'force' ? 'Н' : chosen.kind === 'velocity' ? 'м/с' : 'м/с²')}
                        {field('vector.y', 'Проекция Y', chosen.kind === 'force' ? 'Н' : chosen.kind === 'velocity' ? 'м/с' : 'м/с²')}
                      </DisclosurePanel></Disclosure>
                      <div className="target-summary">
                        {chosen.scope === "all"
                          ? "Все тела, включая будущие"
                          : chosen.targets
                              .map(
                                (id) =>
                                  itemLabel(scene.items.find((o) => o.id === id)!),
                              )
                              .join(", ")}
                      </div>
                      <AppButton
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
                      </AppButton>
                      {chosen.kind === "acceleration" && (
                        <AriaCheckbox className="check" isSelected={!!chosen.gravity} onChange={checked => change(chosen.id, { gravity: checked })}><span className="checkbox-indicator" aria-hidden="true" />Ускорение свободного падения</AriaCheckbox>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="pair">
                        {field("x", "x", "м", -1e5, 1e5, running)}
                        {field("y", "y", "м", -1e5, 1e5, running)}
                      </div>
                      {["circle", "pulley", "bearing"].includes(chosen.kind) ? (
                        field("radius", "Радиус", "м", 0.0005, 1e5, running)
                      ) : chosen.kind === "surface" ? (
                        field("w", "Длина", "м", 0.001, 1e5, running)
                      ) : !["spring", "rope"].includes(chosen.kind) && (
                        <div className="pair">
                          {field("w", chosen.kind === "rod" ? "Длина" : "Ширина", "м", 0.001, 1e5, running)}
                          {field("h", chosen.kind === "rod" ? "Толщина" : "Высота", "м", 0.001, 1e5, running)}
                        </div>
                      )}
                      {!["bearing", "spring", "rope"].includes(chosen.kind) && field("angle", "Угол φ", "рад", -1e5, 1e5, running)}
                      {chosen.kind === "surface" && <div className="pair">
                        {field("mu", "Трение μ", "", 0)}
                        {field("restitution", "Восстановление e", "", 0, 1)}
                      </div>}
                      {body(chosen) && chosen.kind !== "surface" ? (
                        <>
                          <div className="pair">
                            {field(
                              "mass",
                              "Масса m",
                              "кг",
                              chosen.fixed ? 0 : 0.001,
                            )}
                            {field("mu", "Трение μ", "", 0)}
                          </div>
                          {field("restitution", "Восстановление e", "", 0, 1)}
                          <div className="pair">
                            {field('velocity.magnitude', 'Модуль скорости', 'м/с', 0)}
                            {field("omega", "Вращение ω", "рад/с")}
                          </div>
                          {field('velocity.angle', 'Угол скорости', '°', 0, 360)}
                          <Disclosure className="observed-fields"><Heading level={3}><AppButton slot="trigger">Проекции скорости</AppButton></Heading><DisclosurePanel>
                            {field('vx', 'Скорость X', 'м/с')}
                            {field('vy', 'Скорость Y', 'м/с')}
                          </DisclosurePanel></Disclosure>
                          <Disclosure className="observed-fields"><Heading level={3}><AppButton slot="trigger">Вычисляемые величины</AppButton></Heading><DisclosurePanel>{derivedFields.map(f => field(f.key, f.label, f.unit, -1e5, 1e5, true))}</DisclosurePanel></Disclosure>
                          <AriaCheckbox className="check" isSelected={chosen.fixed} isDisabled={running} onChange={checked => change(chosen.id, { fixed: checked })}><span className="checkbox-indicator" aria-hidden="true" />Закрепить {chosen.kind === "pulley" ? "ось" : "тело"}</AriaCheckbox>
                        </>
                      ) : (
                        <>
                          {chosen.kind === "bearing" ? (
                            <AriaCheckbox className="check" isSelected={chosen.fixed} isDisabled={running} onChange={checked => change(chosen.id, { fixed: checked })}><span className="checkbox-indicator" aria-hidden="true" />Закрепить центр</AriaCheckbox>
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
                                <div className="select-field">
                                  <span>Через блок</span>
                                  <SelectControl label="Через блок" value={chosen.via || ""} disabled={running} onChange={via => change(chosen.id, { via: via || undefined })} options={[
                                    { value: "", label: "Без блока", text: "Без блока" },
                                    ...bodies.filter(b => b.kind === "pulley").map(b => ({ value: b.id, label: `Блок ${indexLabel(b)}`, text: `Блок ${indexLabel(b)}` })),
                                  ]} />
                                </div>
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
                                    {itemLabel(scene.items.find((o) => o.id === a.id)!)}
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
                                  {itemLabel(scene.items.find((o) => o.id === a.id)!)}
                                </span>
                                <Tool
                                  label={`Отсоединить ${itemLabel(scene.items.find((o) => o.id === a.id)!)}`}
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
            <h2>Объекты сцены</h2>
            <div className="scroll object-list">
              {scene.items.map((o) => (
                <AppButton
                  key={o.id}
                  className={
                    "object-row " +
                    (selected === o.id ? "selected" : "") +
                    (pending &&
                    ((pending.scope !== "selection" && body(o)) || pending.ids.includes(o.id))
                      ? " target"
                      : "")
                  }
                  onClick={() => choose(o.id)}
                >
                  <ComponentIcon kind={o.kind} />
                  {geo(o) && o.fixed && <LockSimpleIcon size={12} className="lock" />}
                  <span>{o.kind === "acceleration" && o.gravity ? "Свободное падение" : names[o.kind]}</span>
                  {o.kind !== "surface" && <i>{indexLabel(o)}</i>}
                </AppButton>
              ))}
            </div>
          </section>
        </aside>
      </main>
      {saveDialog && <SaveAsDialog onSave={save} onClose={() => setSaveDialog(false)} />}
      {!running && editVariable && <VariableEditor key={editVariable} variable={scene.variables?.find(v => v.id === editVariable)} suggestedSymbol={newSymbol(scene.variables)} onClose={() => setEditVariable(null)} onSave={draft => {
        try { return registryChange(saveVariable(current.current, { ...draft, ...(editVariable === 'new' ? {} : { id: editVariable }) })) ? null : 'Не удалось сохранить переменную'; }
        catch (error) { return error instanceof Error ? error.message : String(error); }
      }} />}
      {!running && editGraph && scene.variables?.find(v => v.id === editGraph) && <GraphEditor key={editGraph} variable={scene.variables.find(v => v.id === editGraph)!} variables={scene.variables || []} onClose={() => setEditGraph(null)} onSave={graph => { updateVariable(editGraph, { graph }); }} />}
    </div>
  );
}
