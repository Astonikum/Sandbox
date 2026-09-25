import { useEffect, useRef, useState } from 'react';
import { select } from 'd3-selection';
import { zoom, zoomIdentity, type ZoomTransform } from 'd3-zoom';
import { convertUnit, displayUnit, displayValue } from './variables';
import type { Point, Variable } from './variables';

type Graph = NonNullable<Variable['graph']>;
export function GraphEditor({ variable, variables, onSave, onClose }: { variable: Variable; variables: Variable[]; onSave: (graph: Graph) => void; onClose: () => void }) {
  const [source, setSource] = useState(variable.graph?.source || 'time');
  const [points, setPoints] = useState<Point[]>(() => {
    const input = structuredClone(variable.graph?.points || [{ x: 0, y: variable.value }, { x: 10, y: variable.value }]);
    const xVariable = variables.find(v => v.id === variable.graph?.source);
    return input.map(p => ({ ...p, x: xVariable ? displayValue(xVariable, p.x) : p.x, y: displayValue(variable, p.y), ...(p.inY === undefined ? {} : { inY: displayValue(variable, p.inY) }), ...(p.outY === undefined ? {} : { outY: displayValue(variable, p.outY) }) }));
  });
  const [selected, setSelected] = useState<number | null>(null);
  const [scaleX, setScaleX] = useState(50), [scaleY, setScaleY] = useState(40);
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity.translate(90, 300));
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ index: number; kind: 'point' | 'in' | 'out' } | null>(null);
  const currentTransform = useRef(transform);
  useEffect(() => { currentTransform.current = transform; }, [transform]);
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const behavior = zoom<SVGSVGElement, unknown>().scaleExtent([.01, 100]).filter(event => !event.target?.closest?.('.graph-handle') && event.button === 0).on('zoom', event => setTransform(event.transform));
    const selection = select(el);
    selection.call(behavior);
    selection.call(behavior.transform, zoomIdentity.translate(90, 300));
    return () => { selection.on('.zoom', null); };
  }, []);
  const position = (event: { clientX: number; clientY: number }) => {
    const rect = svg.current!.getBoundingClientRect();
    const sx = (event.clientX - rect.left) * 780 / rect.width, sy = (event.clientY - rect.top) * 420 / rect.height;
    const t = currentTransform.current;
    return { x: t.invertX(sx) / scaleX, y: -t.invertY(sy) / scaleY };
  };
  const path = `M${Math.min(transform.invertX(0) / scaleX, points[0].x) * scaleX},${-points[0].y * scaleY} ` + points.map((p, i) => {
    const xy = `${p.x * scaleX},${-p.y * scaleY}`;
    if (i === 0) return `L${xy}`;
    const a = points[i - 1], dx = (p.x - a.x) * scaleX / 3;
    if (p.break) return `L${p.x * scaleX},${-a.y * scaleY} M${xy}`;
    return `C${a.x * scaleX + dx},${-(a.outY ?? a.y) * scaleY} ${p.x * scaleX - dx},${-(p.inY ?? p.y) * scaleY} ${xy}`;
  }).join(' ') + ` L${Math.max(transform.invertX(780) / scaleX, points.at(-1)!.x) * scaleX},${-points.at(-1)!.y * scaleY}`;
  const ticks = (axis: 'x' | 'y') => {
    const t = transform, span = axis === 'x' ? 780 / (scaleX * t.k) : 420 / (scaleY * t.k);
    const start = axis === 'x' ? t.invertX(0) / scaleX : -t.invertY(420) / scaleY;
    const end = start + span;
    const step = 10 ** Math.floor(Math.log10(span / 8 || 1));
    const out: number[] = [];
    for (let n = Math.ceil(start / step) * step; n <= end && out.length < 60; n += step) out.push(Number(n.toFixed(8)));
    return out;
  };
  return <div className="editor-backdrop" role="presentation" onClick={onClose}>
    <div className="graph-editor" role="dialog" aria-modal="true" aria-label={`График ${variable.symbol}`} onClick={e => e.stopPropagation()}>
      <div className="editor-heading"><h3>График {variable.symbol}</h3><button onClick={onClose} aria-label="Закрыть">×</button></div>
      <div className="graph-controls"><label>От <select value={source} onChange={e => setSource(e.target.value)}><option value="time">Времени t, с</option>{variables.filter(v => v.id !== variable.id).map(v => <option key={v.id} value={v.id}>{v.symbol} · {displayUnit(v)}</option>)}</select></label>
        <label>Масштаб X <input type="number" min="1" max="1000" value={scaleX} onChange={e => setScaleX(Math.max(1, Math.min(1000, Number(e.target.value) || 1)))} /></label>
        <label>Y, {displayUnit(variable)} <input type="number" min="1" max="1000" value={scaleY} onChange={e => setScaleY(Math.max(1, Math.min(1000, Number(e.target.value) || 1)))} /></label></div>
      <svg ref={svg} className="graph-canvas" viewBox="0 0 780 420" role="img" aria-label="Редактор графика: двойной щелчок добавляет точку" onDoubleClick={e => { const p = position(e); if (points.some(q => Math.abs(q.x - p.x) < .001)) return; setPoints([...points, p].sort((a, b) => a.x - b.x)); }}
        onPointerMove={e => { if (!drag.current) return; const p = position(e), d = drag.current; setPoints(old => old.map((v, i) => i !== d.index ? v : d.kind === 'point' ? { ...v, x: Math.max(old[i-1] ? old[i-1].x + .001 : -1e5, Math.min(old[i+1] ? old[i+1].x - .001 : 1e5, p.x)), y: p.y } : { ...v, [d.kind === 'in' ? 'inY' : 'outY']: p.y })); }}
        onPointerUp={e => { if (drag.current) e.currentTarget.releasePointerCapture(e.pointerId); drag.current = null; }}>
        <rect width="780" height="420" fill="#fafaf8" />
        <g transform={transform.toString()}>
          {ticks('x').map(n => <g key={`x${n}`}><line x1={n*scaleX} x2={n*scaleX} y1={-transform.y/transform.k} y2={(420-transform.y)/transform.k} stroke={n === 0 ? '#aaa' : '#e5e5e0'} strokeWidth={1/transform.k} /><text x={n*scaleX+3/transform.k} y={(420-transform.y)/transform.k-4/transform.k} fontSize={12/transform.k} fill="#777">{n}</text></g>)}
          {ticks('y').map(n => <g key={`y${n}`}><line x1={-transform.x/transform.k} x2={(780-transform.x)/transform.k} y1={-n*scaleY} y2={-n*scaleY} stroke={n === 0 ? '#aaa' : '#e5e5e0'} strokeWidth={1/transform.k} /><text x={(-transform.x+5)/transform.k} y={-n*scaleY-3/transform.k} fontSize={12/transform.k} fill="#777">{n}</text></g>)}
          <path d={path} fill="none" stroke="#292929" strokeWidth={2/transform.k} />
          {points.map((p, i) => <g key={i}>
            {selected === i && <><line x1={p.x*scaleX} y1={-p.y*scaleY} x2={p.x*scaleX-(i ? (p.x-points[i-1].x)*scaleX/3 : 25)} y2={-(p.inY ?? p.y)*scaleY} stroke="#999" strokeWidth={1/transform.k}/><line x1={p.x*scaleX} y1={-p.y*scaleY} x2={p.x*scaleX+(i < points.length-1 ? (points[i+1].x-p.x)*scaleX/3 : 25)} y2={-(p.outY ?? p.y)*scaleY} stroke="#999" strokeWidth={1/transform.k}/>
              {(['in', 'out'] as const).map(kind => <circle className="graph-handle" key={kind} cx={p.x*scaleX+(kind === 'in' ? -(i ? (p.x-points[i-1].x)*scaleX/3 : 25) : (i < points.length-1 ? (points[i+1].x-p.x)*scaleX/3 : 25))} cy={-(kind === 'in' ? p.inY ?? p.y : p.outY ?? p.y)*scaleY} r={5/transform.k} fill="white" stroke="#333" strokeWidth={1.5/transform.k} onPointerDown={e => { e.stopPropagation(); drag.current = { index: i, kind }; svg.current!.setPointerCapture(e.pointerId); }} />)}</>}
            <circle className="graph-handle" cx={p.x*scaleX} cy={-p.y*scaleY} r={7/transform.k} fill={p.break ? '#c14949' : '#222'} stroke="white" strokeWidth={2/transform.k} onPointerDown={e => { e.stopPropagation(); setSelected(i); drag.current = { index: i, kind: 'point' }; svg.current!.setPointerCapture(e.pointerId); }} />
          </g>)}
        </g>
      </svg>
      <div className="graph-footer"><span>Двойной щелчок — точка · перетаскивание — изгиб или панорама · колесо — масштаб</span>
        {selected !== null && <><button onClick={() => setPoints(points.map((p,i) => i === selected ? { ...p, break: !p.break } : p))}>{points[selected]?.break ? 'Соединить' : 'Разорвать'} в точке</button><button disabled={points.length <= 2} onClick={() => { setPoints(points.filter((_,i) => i !== selected)); setSelected(null); }}>Удалить точку</button></>}
        <button className="primary" onClick={() => { const xVariable = variables.find(v => v.id === source); onSave({ source, points: points.map(p => ({ ...p, x: xVariable ? convertUnit(p.x, displayUnit(xVariable), xVariable.unit) : p.x, y: convertUnit(p.y, displayUnit(variable), variable.unit), ...(p.inY === undefined ? {} : { inY: convertUnit(p.inY, displayUnit(variable), variable.unit) }), ...(p.outY === undefined ? {} : { outY: convertUnit(p.outY, displayUnit(variable), variable.unit) }) })) }); }}>Сохранить</button>
      </div>
    </div>
  </div>;
}
