import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import * as echarts from 'echarts/core';
import { LineChart, ScatterChart } from 'echarts/charts';
import { DataZoomComponent, GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { PlusIcon } from '@phosphor-icons/react/dist/csr/Plus';
import { compatibleUnits, convertUnit, displayUnit, displayValue, valueAt } from './variables';
import type { Point, Variable } from './variables';
import { Button as AppButton, SelectControl } from './ui';

echarts.use([LineChart, ScatterChart, DataZoomComponent, GridComponent, TooltipComponent, CanvasRenderer]);

type Graph = NonNullable<Variable['graph']>;
type Drag = { index: number; handle: 'point' | 'inY' | 'outY' };
const limit = 100_000;
const formatGraphNumber = (value: unknown) => {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? String(Number(number.toFixed(3))) : String(value);
};

function sourceWouldCycle(sourceId: string, targetId: string, variables: Variable[]) {
  const visited = new Set<string>();
  let current: Variable | undefined = variables.find(item => item.id === sourceId);
  while (current && !visited.has(current.id)) {
    if (current.id === targetId) return true;
    visited.add(current.id);
    current = current.graph && current.graph.source !== 'time' ? variables.find(item => item.id === current!.graph!.source) : undefined;
  }
  return false;
}

function sampleCurve(points: Point[]): [number, number][] {
  if (points.length < 2) return points.map(point => [point.x, point.y]);
  const samples: [number, number][] = [[points[0].x, points[0].y]];
  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1], point = points[i];
    if (point.break) {
      samples.push([point.x, previous.y], [point.x, point.y]);
      continue;
    }
    for (let step = 1; step <= 16; step++) {
      const x = previous.x + (point.x - previous.x) * step / 16;
      samples.push([x, valueAt(points, x)]);
    }
  }
  return samples;
}

function controlPoints(points: Point[], selected: number | null) {
  if (selected === null || !points[selected]) return { tangent: [], handles: [] };
  const point = points[selected], previous = points[selected - 1], next = points[selected + 1];
  const incoming = previous && !point.break ? [previous.x + (point.x - previous.x) * 2 / 3, point.inY ?? previous.y + (point.y - previous.y) * 2 / 3] as [number, number] : null;
  const outgoing = next && !next.break ? [point.x + (next.x - point.x) / 3, point.outY ?? point.y + (next.y - point.y) / 3] as [number, number] : null;
  return {
    tangent: [...(incoming ? [incoming] : []), [point.x, point.y] as [number, number], ...(outgoing ? [outgoing] : [])],
    handles: [incoming, outgoing].filter((handle): handle is [number, number] => handle !== null),
  };
}

function displayPoints(variable: Variable, source: string, variables: Variable[]): Point[] {
  const sourceVariable = variables.find(item => item.id === source);
  return structuredClone(variable.graph?.points || [{ x: 0, y: variable.value }, { x: 10, y: variable.value }]).map(point => ({ ...point,
    x: sourceVariable ? displayValue(sourceVariable, point.x) : point.x,
    y: displayValue(variable, point.y),
    ...(point.inY === undefined ? {} : { inY: displayValue(variable, point.inY) }),
    ...(point.outY === undefined ? {} : { outY: displayValue(variable, point.outY) }),
  }));
}

function insertPointPreservingCurve(points: Point[], segment: number, x: number): Point[] {
  const left = points[segment], right = points[segment + 1];
  if (right.break) return [...points.slice(0, segment + 1), { x, y: left.y }, ...points.slice(segment + 1)];
  const t = (x - left.x) / (right.x - left.x), mix = (a: number, b: number) => a + (b - a) * t,
    p0 = left.y, p1 = left.outY ?? left.y + (right.y - left.y) / 3,
    p2 = right.inY ?? left.y + (right.y - left.y) * 2 / 3, p3 = right.y,
    q0 = mix(p0, p1), q1 = mix(p1, p2), q2 = mix(p2, p3),
    r0 = mix(q0, q1), r1 = mix(q1, q2), y = mix(r0, r1);
  return [
    ...points.slice(0, segment),
    { ...left, outY: q0 },
    { x, y, inY: r0, outY: r1 },
    { ...right, inY: q2 },
    ...points.slice(segment + 2),
  ];
}

export function VariableGraph({ variable, variables, editable = false, onSave, onRequestEdit }: { variable: Variable; variables: Variable[]; editable?: boolean; onSave?: (graph: Graph) => void; onRequestEdit?: () => void }) {
  const [source, setSource] = useState(variable.graph?.source || 'time');
  const [points, setPoints] = useState(() => displayPoints(variable, variable.graph?.source || 'time', variables));
  const [selected, setSelected] = useState<number | null>(null);
  const element = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.EChartsType | null>(null);
  const pointsRef = useRef(points);
  const sourceRef = useRef(source);
  const drag = useRef<Drag | null>(null);
  const axisRange = useRef<{ xMin: number; xMax: number; yMin: number; yMax: number } | null>(null);
  pointsRef.current = points;
  sourceRef.current = source;

  const sourceOptions = [
    { value: 'time', label: 't · Время', text: 'Время t' },
    ...variables.filter(item => item.id !== variable.id && !sourceWouldCycle(item.id, variable.id, variables)).map(item => ({
      value: item.id, label: `${item.symbol} · ${displayUnit(item) || 'без единицы'}`, text: `${item.symbol} ${displayUnit(item)}`,
    })),
  ];

  const save = (nextSource = sourceRef.current, nextPoints = pointsRef.current) => {
    const xVariable = variables.find(item => item.id === nextSource);
    const valueUnit = displayUnit(variable);
    onSave?.({ source: nextSource, points: nextPoints.map(point => ({ ...point,
      x: xVariable ? convertUnit(point.x, displayUnit(xVariable), xVariable.unit) : point.x,
      y: convertUnit(point.y, valueUnit, variable.unit),
      ...(point.inY === undefined ? {} : { inY: convertUnit(point.inY, valueUnit, variable.unit) }),
      ...(point.outY === undefined ? {} : { outY: convertUnit(point.outY, valueUnit, variable.unit) }),
    })) });
  };
  const saveRef = useRef(save);
  saveRef.current = save;

  const addKeyPoint = () => {
    const current = pointsRef.current;
    if (current.length >= 500) return;
    let segment = 0;
    for (let index = 1; index < current.length - 1; index++) {
      if (current[index + 1].x - current[index].x > current[segment + 1].x - current[segment].x) segment = index;
    }
    const x = current[segment].x + (current[segment + 1].x - current[segment].x) / 2;
    if (!(x > current[segment].x && x < current[segment + 1].x)) return;
    const next = insertPointPreservingCurve(current, segment, x);
    pointsRef.current = next;
    setPoints(next);
    setSelected(segment + 1);
    axisRange.current = null;
    saveRef.current(sourceRef.current, next);
  };

  useEffect(() => {
    const nextSource = variable.graph?.source || 'time';
    sourceRef.current = nextSource;
    setSource(nextSource);
    const nextPoints = displayPoints(variable, nextSource, variables);
    pointsRef.current = nextPoints;
    setPoints(nextPoints);
    axisRange.current = null;
  }, [variable.graph, variable.value, variable.unit, variable.displayUnit, variables]);

  useEffect(() => {
    if (!element.current) return;
    const instance = echarts.init(element.current, undefined, { renderer: 'canvas' });
    chart.current = instance;
    instance.setOption({
      animation: false,
      grid: { left: 36, right: 8, top: 8, bottom: editable ? 32 : 8 },
      tooltip: { trigger: 'axis', valueFormatter: formatGraphNumber, axisPointer: { type: 'cross' }, backgroundColor: '#eff1f5', borderColor: '#ccd0da', textStyle: { color: '#4c4f69' } },
      xAxis: { type: 'value', axisLabel: { color: '#6c6f85', fontSize: 9, formatter: formatGraphNumber }, axisLine: { lineStyle: { color: '#bcc0cc' } }, splitLine: { lineStyle: { color: '#e6e9ef' } } },
      yAxis: { type: 'value', scale: true, axisLabel: { color: '#6c6f85', fontSize: 9, formatter: formatGraphNumber }, axisLine: { lineStyle: { color: '#bcc0cc' } }, splitLine: { lineStyle: { color: '#e6e9ef' } } },
      dataZoom: editable ? [{ type: 'inside', filterMode: 'none' }, { type: 'slider', height: 10, bottom: 0, borderColor: 'transparent', backgroundColor: '#e6e9ef', fillerColor: 'rgba(30, 102, 245, .12)', handleStyle: { color: '#1e66f5' } }] : [],
      series: [
        { id: 'dependency-curve', type: 'line', showSymbol: false, data: [], lineStyle: { color: '#1e66f5', width: 2 }, emphasis: { disabled: true } },
        { id: 'dependency-points', type: 'scatter', data: [], symbolSize: 8, itemStyle: { color: '#1e66f5', borderColor: '#eff1f5', borderWidth: 2 }, emphasis: { scale: 1.3 } },
        { id: 'dependency-tangents', type: 'line', showSymbol: false, data: [], lineStyle: { color: '#40a02b', width: 1, type: 'dashed', opacity: .7 }, emphasis: { disabled: true } },
        { id: 'dependency-handles', type: 'scatter', data: [], symbolSize: 8, itemStyle: { color: '#40a02b', borderColor: '#eff1f5', borderWidth: 1.5 }, emphasis: { disabled: true } },
      ],
    });
    if (editable) instance.on('click', params => {
      if (params.seriesIndex === 1 && typeof params.dataIndex === 'number') setSelected(params.dataIndex);
    });
    if (editable) instance.getZr().on('dblclick', event => {
      const position: [number, number] = [event.offsetX, event.offsetY];
      if (pointsRef.current.length >= 500 || !instance.containPixel({ gridIndex: 0 }, position)) return;
      const [rawX, rawY] = instance.convertFromPixel({ gridIndex: 0 }, position) as [number, number];
      const current = pointsRef.current;
      const index = current.findIndex(point => point.x > rawX);
      const insertion = index < 0 ? current.length : index;
      const minX = insertion ? current[insertion - 1].x + 1e-6 : -limit;
      const maxX = current[insertion] ? current[insertion].x - 1e-6 : limit;
      if (minX > maxX) return;
      const next = [...current];
      next.splice(insertion, 0, { x: Math.max(minX, Math.min(maxX, rawX)), y: Math.max(-limit, Math.min(limit, rawY)) });
      pointsRef.current = next;
      setPoints(next);
      setSelected(insertion);
      saveRef.current(sourceRef.current, next);
    });
    const resizeObserver = new ResizeObserver(() => instance.resize());
    resizeObserver.observe(element.current);
    return () => { resizeObserver.disconnect(); instance.dispose(); chart.current = null; };
  }, [editable]);

  useEffect(() => {
    const instance = chart.current;
    if (!instance) return;
    const curve = sampleCurve(points),
      xMin = Math.min(...points.map(point => point.x)),
      xMax = Math.max(...points.map(point => point.x)),
      yMin = Math.min(...curve.map(([, y]) => y)),
      yMax = Math.max(...curve.map(([, y]) => y)),
      xPadding = Math.max((xMax - xMin) * .08, 1e-6),
      yPadding = Math.max((yMax - yMin) * .1, Math.max(1, Math.abs(yMin), Math.abs(yMax)) * .1);
    if (!drag.current || !axisRange.current) axisRange.current = { xMin: xMin - xPadding, xMax: xMax + xPadding, yMin: yMin - yPadding, yMax: yMax + yPadding };
    const range = axisRange.current;
    const controls = controlPoints(points, selected);
    instance.setOption({
      xAxis: { min: range.xMin, max: range.xMax },
      yAxis: { min: range.yMin, max: range.yMax },
      series: [
        { id: 'dependency-curve', data: curve },
        { id: 'dependency-points', data: editable ? points.map((point, index) => ({ value: [point.x, point.y], itemStyle: { color: selected === index ? '#8839ef' : '#1e66f5' } })) : [] },
        { id: 'dependency-tangents', data: editable ? controls.tangent : [] },
        { id: 'dependency-handles', data: editable ? controls.handles : [] },
      ],
    });
  }, [points, selected, editable]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const instance = chart.current, host = element.current;
    if (!instance || !host) return;
    const rect = host.getBoundingClientRect(), position: [number, number] = [event.clientX - rect.left, event.clientY - rect.top];
    const current = pointsRef.current;
    let hit: Drag | null = null, distance = 14;
    if (selected !== null && current[selected]) {
      const point = current[selected], previous = current[selected - 1], next = current[selected + 1];
      const handles: { handle: 'inY' | 'outY'; x: number; y: number; enabled: boolean }[] = [
        { handle: 'inY', x: previous ? previous.x + (point.x - previous.x) * 2 / 3 : 0, y: point.inY ?? point.y, enabled: !!previous && !point.break },
        { handle: 'outY', x: next ? point.x + (next.x - point.x) / 3 : 0, y: point.outY ?? point.y, enabled: !!next && !next.break },
      ];
      for (const candidate of handles) {
        if (!candidate.enabled) continue;
        const pixel = instance.convertToPixel({ gridIndex: 0 }, [candidate.x, candidate.y]) as [number, number];
        const nextDistance = Math.hypot(position[0] - pixel[0], position[1] - pixel[1]);
        if (nextDistance < distance) { distance = nextDistance; hit = { index: selected, handle: candidate.handle }; }
      }
    }
    if (!hit) current.forEach((point, index) => {
      const pixel = instance.convertToPixel({ gridIndex: 0 }, [point.x, point.y]) as [number, number];
      const nextDistance = Math.hypot(position[0] - pixel[0], position[1] - pixel[1]);
      if (nextDistance < distance) { distance = nextDistance; hit = { index, handle: 'point' }; }
    });
    if (!hit) return;
    event.preventDefault();
    host.setPointerCapture(event.pointerId);
    host.focus({ preventScroll: true });
    drag.current = hit;
    setSelected(hit.index);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = drag.current, instance = chart.current, host = element.current;
    if (!active || !instance || !host) return;
    const rect = host.getBoundingClientRect(), position: [number, number] = [event.clientX - rect.left, event.clientY - rect.top];
    const [rawX, rawY] = instance.convertFromPixel({ gridIndex: 0 }, position) as [number, number];
    const current = pointsRef.current;
    pointsRef.current = current.map((point, index) => {
      if (index !== active.index) return point;
      if (active.handle === 'inY' || active.handle === 'outY') return { ...point, [active.handle]: Math.max(-limit, Math.min(limit, rawY)) };
      const minX = current[index - 1] ? current[index - 1].x + 1e-6 : -limit;
      const maxX = current[index + 1] ? current[index + 1].x - 1e-6 : limit;
      const y = Math.max(-limit, Math.min(limit, rawY)), delta = y - point.y;
      return { ...point, x: Math.max(minX, Math.min(maxX, rawX)), y,
        ...(point.inY === undefined ? {} : { inY: point.inY + delta }),
        ...(point.outY === undefined ? {} : { outY: point.outY + delta }),
      };
    });
    setPoints(pointsRef.current);
  };

  const handlePointerUp = () => {
    if (!drag.current) return;
    drag.current = null;
    axisRange.current = null;
    setPoints([...pointsRef.current]);
    save();
  };

  const changeSource = (nextSource: string) => {
    const oldVariable = variables.find(item => item.id === sourceRef.current), nextVariable = variables.find(item => item.id === nextSource);
    const oldUnit = oldVariable ? displayUnit(oldVariable) : 'с', nextUnit = nextVariable ? displayUnit(nextVariable) : 'с';
    const nextPoints = oldUnit !== nextUnit && compatibleUnits(oldUnit, nextUnit)
      ? pointsRef.current.map(point => ({ ...point, x: convertUnit(point.x, oldUnit, nextUnit) }))
      : pointsRef.current;
    sourceRef.current = nextSource;
    pointsRef.current = nextPoints;
    setSource(nextSource);
    setPoints(nextPoints);
    axisRange.current = null;
    save(nextSource, nextPoints);
  };

  const editPoint = (index: number, axis: 'x' | 'y', value: number) => {
    const current = pointsRef.current;
    const next = current.map((point, pointIndex) => {
      if (pointIndex !== index) return point;
      if (axis === 'x') {
        const minX = current[index - 1] ? current[index - 1].x + 1e-6 : -limit;
        const maxX = current[index + 1] ? current[index + 1].x - 1e-6 : limit;
        return { ...point, x: Math.max(minX, Math.min(maxX, value)) };
      }
      const y = Math.max(-limit, Math.min(limit, value)), delta = y - point.y;
      return { ...point, y,
        ...(point.inY === undefined ? {} : { inY: point.inY + delta }),
        ...(point.outY === undefined ? {} : { outY: point.outY + delta }),
      };
    });
    pointsRef.current = next;
    setPoints(next);
    setSelected(index);
    axisRange.current = null;
    save(sourceRef.current, next);
  };

  const deleteSelected = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if ((event.key !== 'Delete' && event.key !== 'Backspace') || selected === null || pointsRef.current.length <= 2 || event.repeat) return;
    event.preventDefault();
    const next = pointsRef.current.filter((_, index) => index !== selected);
    pointsRef.current = next;
    setPoints(next);
    setSelected(Math.min(selected, next.length - 1));
    save(sourceRef.current, next);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (editable) deleteSelected(event);
    else if ((event.key === 'Enter' || event.key === ' ') && onRequestEdit) { event.preventDefault(); onRequestEdit(); }
  };

  const graph = <div ref={element} className={`dependency-chart ${editable ? 'editor-dependency-chart' : 'graph-preview-chart'}`} tabIndex={0} role={editable ? 'application' : 'button'}
    aria-label={editable ? `График ${variable.symbol}. Перетаскивайте ключевые точки и зелёные маркеры, чтобы менять изгиб. Двойной щелчок добавляет точку, Delete удаляет выбранную.` : `Открыть редактор графика зависимости ${variable.symbol}`}
    title={editable ? undefined : 'Редактировать график'}
    onClickCapture={editable ? undefined : onRequestEdit} onPointerDownCapture={editable ? handlePointerDown : undefined} onPointerMove={editable ? handlePointerMove : undefined} onPointerUp={editable ? handlePointerUp : undefined} onPointerCancel={editable ? handlePointerUp : undefined} onKeyDown={handleKeyDown} />;

  if (!editable) return graph;
  return <>
    <div className="variable-graph-source"><span>Зависимость от:</span><SelectControl label={`Зависимость от ${variable.symbol}`} value={source} onChange={changeSource} options={sourceOptions} /></div>
    <div className="graph-editor-body">
      {graph}
      <GraphPointList points={points} selected={selected} onSelect={setSelected} onEdit={editPoint} onAdd={addKeyPoint} canAdd={points.length < 500} />
    </div>
  </>;
}

function GraphPointList({ points, selected, onSelect, onEdit, onAdd, canAdd }: { points: Point[]; selected: number | null; onSelect: (index: number) => void; onEdit: (index: number, axis: 'x' | 'y', value: number) => void; onAdd: () => void; canAdd: boolean }) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  useEffect(() => setDrafts({}), [points]);
  const axisName = { x: 'X', y: 'Y' } as const;
  const commit = (index: number, axis: 'x' | 'y') => {
    const key = `${index}-${axis}`;
    const draft = drafts[key];
    if (draft !== undefined && draft.trim() !== '' && Number.isFinite(Number(draft))) onEdit(index, axis, Number(draft));
    setDrafts(current => { const next = { ...current }; delete next[key]; return next; });
  };
  return <div className="graph-key-points" aria-label="Ключевые точки">
    <div className="graph-key-point-head"><span>X</span><span>Y</span><AppButton aria-label="Добавить ключевую точку" disabled={!canAdd} onClick={onAdd}><PlusIcon weight="fill" /></AppButton></div>
    {points.map((point, index) => <div className={`graph-key-point ${selected === index ? 'selected' : ''}`} key={index} onClick={() => onSelect(index)}>
      {(['x', 'y'] as const).map(axis => {
        const key = `${index}-${axis}`;
        return <input key={axis} type="text" inputMode="decimal" aria-label={`Точка ${index + 1}, ${axisName[axis]}`} value={drafts[key] ?? formatGraphNumber(point[axis])}
          onChange={event => setDrafts(current => ({ ...current, [key]: event.target.value }))} onFocus={() => onSelect(index)} onBlur={() => commit(index, axis)} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />;
      })}
    </div>)}
  </div>;
}

export function GraphEditor({ variable, variables, onSave, onClose }: { variable: Variable; variables: Variable[]; onSave: (graph: Graph) => void; onClose: () => void }) {
  return <ModalOverlay className="editor-backdrop" isOpen isDismissable onOpenChange={open => { if (!open) onClose(); }}>
    <Modal><Dialog className="graph-editor" aria-label={`График зависимости ${variable.symbol}`}>
      <div className="graph-editor-heading"><Heading slot="title" level={3}>График зависимости {variable.symbol}</Heading><AppButton onClick={onClose} aria-label="Закрыть график">×</AppButton></div>
      <VariableGraph variable={variable} variables={variables} editable onSave={onSave} />
    </Dialog></Modal>
  </ModalOverlay>;
}
