import type { Item, Scene, Vec } from './model';

export type Point = { x: number; y: number; inY?: number; outY?: number; break?: boolean };
export type VariableMode = 'number' | 'range' | 'graph';
export type Variable = { id: string; symbol: string; value: number; unit: string; displayUnit?: string; visible: boolean; mode?: VariableMode; auto?: boolean; visibilityLocked?: boolean; derived?: { itemId: string; index: number }; range?: { min: number; max: number; step: number }; graph?: { source: string; points: Point[] } };
export type VariableScene = Scene & { variables?: Variable[]; bindings?: Record<string, string> };
export type Field = { key: string; label: string; unit: string; letter: string; min?: number; max?: number; computed?: boolean };
export function variableMode(variable: Variable): VariableMode {
  return variable.mode ?? (variable.graph ? 'graph' : variable.range ? 'range' : 'number');
}
const scales: Record<string, number> = { 'мк': 1e-6, 'м': 1e-3, 'с': 1e-2, 'д': 1e-1, '': 1, 'к': 1e3, 'М': 1e6, 'Г': 1e9 };
const prefixed = (unit: string, prefixes: string[], factor = 1, power = 1) =>
  Object.fromEntries(prefixes.map(prefix => [`${prefix}${unit}`, factor * scales[prefix] ** power]));
const unitFamilies: Record<string, number>[] = [
  prefixed('м', ['мк', 'м', 'с', 'д', '', 'к']),
  { ...prefixed('с', ['мк', 'м', '']), 'мин': 60, 'ч': 3600, 'сут': 86400 },
  { 'см/с': .01, ...prefixed('м/с', ['', 'к']), 'км/ч': 1 / 3.6 },
  { 'см/с²': .01, 'м/с²': 1 },
  { '°': Math.PI / 180, ...prefixed('рад', ['мк', 'м', '']) },
  { '°/с': Math.PI / 180, 'об/мин': 2 * Math.PI / 60, 'рад/с': 1 },
  { '°/с²': Math.PI / 180, 'рад/с²': 1 },
  { ...prefixed('г', ['мк', 'м', '', 'к'], .001), 'т': 1000 },
  prefixed('Н', ['мк', 'м', '', 'к', 'М']),
  prefixed('Н·м', ['м', '', 'к']),
  prefixed('Н/м', ['м', '', 'к']),
  prefixed('Н·с/м', ['м', '', 'к']),
  prefixed('Дж', ['м', '', 'к', 'М', 'Г']),
  prefixed('Гц', ['мк', 'м', '', 'к', 'М', 'Г']),
  prefixed('м²', ['м', 'с', '', 'к'], 1, 2),
  { ...prefixed('м³', ['м', 'с', ''], 1, 3), ...prefixed('л', ['м', ''], .001) },
  { 'г/м³': .001, 'кг/м³': 1, 'г/см³': 1000 },
  { 'г/Н': .001, 'кг/Н': 1 },
  { 'г·м/с': .001, 'кг·м/с': 1 },
  { 'мН·с': .001, 'Н·с': 1, 'кН·с': 1000 },
  { 'г·м²': .001, 'кг·м²': 1 },
  { '': 1, '%': .01 },
];
export const allowedUnits = [...new Set(unitFamilies.flatMap(family => Object.keys(family)))];
export const knownUnit = (unit: string) => allowedUnits.includes(unit);
export const unitChoices = (unit: string) => Object.keys(unitFamilies.find(family => Object.hasOwn(family, unit)) || { [unit]: 1 });
export const compatibleUnits = (from: string, to: string) => from === to || unitFamilies.some(family => Object.hasOwn(family, from) && Object.hasOwn(family, to));
export function convertUnit(value: number, from: string, to: string): number {
  if (from === to) return value;
  const family = unitFamilies.find(group => Object.hasOwn(group, from) && Object.hasOwn(group, to));
  if (!family) throw Error(`Несовместимые единицы: ${from} и ${to}`);
  return value * family[from] / family[to];
}
const primaryAngularUnits = new Map([['рад', '°'], ['рад/с', '°/с'], ['рад/с²', '°/с²']]);
export const displayUnit = (variable: Variable) => variable.displayUnit !== undefined && compatibleUnits(variable.unit, variable.displayUnit) ? variable.displayUnit : primaryAngularUnits.get(variable.unit) ?? variable.unit;
export const displayValue = (variable: Variable, value = variable.value) => convertUnit(value, variable.unit, displayUnit(variable));
const f = (key: string, label: string, unit: string, letter: string, min?: number, max?: number): Field => ({ key, label, unit, letter, min, max });
const magnitude = (v: Vec) => Math.hypot(v.x, v.y);
// Canvas Y points down; the user-facing angle grows counterclockwise from right.
const direction = (v: Vec) => magnitude(v) ? (Math.atan2(-v.y, v.x) * 180 / Math.PI + 360) % 360 : 0;
const polar = (length: number, degrees: number): Vec => {
  const x = length * Math.cos(degrees * Math.PI / 180), y = -length * Math.sin(degrees * Math.PI / 180);
  return { x: Math.abs(x) < length * 1e-12 ? 0 : x, y: Math.abs(y) < length * 1e-12 ? 0 : y };
};
const observations = [
  ['Ускорение X', 'м/с²', 'a'], ['Ускорение Y', 'м/с²', 'a'],
  ['Тяжесть X', 'Н', 'G'], ['Тяжесть Y', 'Н', 'G'],
  ['Реакция X', 'Н', 'N'], ['Реакция Y', 'Н', 'N'],
  ['Трение X', 'Н', 'f'], ['Трение Y', 'Н', 'f'],
  ['Упругость X', 'Н', 'S'], ['Упругость Y', 'Н', 'S'],
  ['Крепление X', 'Н', 'R'], ['Крепление Y', 'Н', 'R'],
  ['Натяжение X', 'Н', 'T'], ['Натяжение Y', 'Н', 'T'],
  ['Результирующая X', 'Н', 'F'], ['Результирующая Y', 'Н', 'F'],
  ['Вес X', 'Н', 'P'], ['Вес Y', 'Н', 'P'],
  ['Момент', 'Н·м', 'τ'], ['Угловое ускорение', 'рад/с²', 'α'],
] as const;
export const derivedFields = observations.map(([label, unit, letter], index): Field => ({ ...f(`derived.${index}`, label, unit, letter), computed: true }));
export function fields(o: Item): Field[] {
  if ('vector' in o) {
    const unit = o.kind === 'force' ? 'Н' : o.kind === 'velocity' ? 'м/с' : 'м/с²';
    const letter = o.kind === 'force' ? 'F' : o.kind === 'velocity' ? 'v' : 'a';
    return [f('vector.magnitude', 'Модуль', unit, letter, 0), f('vector.angle', 'Угол', '°', `θ${letter}`, 0, 360), f('vector.x', 'Проекция X', unit, letter), f('vector.y', 'Проекция Y', unit, letter)];
  }
  const position = [f('x', 'Положение X', 'м', 'x'), f('y', 'Положение Y', 'м', 'y')];
  if (o.kind === 'surface') return [...position, f('w', 'Длина', 'м', 'l', .001), f('angle', 'Угол', 'рад', 'φ'), f('mu', 'Трение', '', 'μ', 0), f('restitution', 'Восстановление', '', 'e', 0, 1)];
  if (['circle', 'pulley'].includes(o.kind)) return [...position, f('radius', 'Радиус', 'м', 'r', .0005), f('angle', 'Угол', 'рад', 'φ'), ...bodyFields(o)];
  if (o.kind === 'rect') return [...position, f('w', 'Ширина', 'м', 'w', .001), f('h', 'Высота', 'м', 'h', .001), f('angle', 'Угол', 'рад', 'φ'), ...bodyFields(o)];
  if (o.kind === 'rod') return [...position, f('w', 'Длина', 'м', 'l', .001), f('h', 'Толщина', 'м', 'h', .001), f('angle', 'Угол', 'рад', 'φ'), ...bodyFields(o)];
  if (o.kind === 'bearing') return [...position, f('radius', 'Радиус', 'м', 'r', .0005)];
  return [...position, f('length', 'Длина покоя', 'м', 'l', .001), ...(o.kind === 'spring' ? [f('stiffness', 'Жёсткость', 'Н/м', 'k', 0), f('damping', 'Демпфирование', 'Н·с/м', 'd', 0)] : [])];
}
function bodyFields(o: Item): Field[] {
  if (!('mass' in o)) return [];
  return [f('mass', 'Масса', 'кг', 'm', o.fixed ? 0 : .001), f('mu', 'Трение', '', 'μ', 0), f('restitution', 'Восстановление', '', 'e', 0, 1), f('velocity.magnitude', 'Модуль скорости', 'м/с', 'v', 0), f('velocity.angle', 'Угол скорости', '°', 'θv', 0, 360), f('vx', 'Скорость X', 'м/с', 'v'), f('vy', 'Скорость Y', 'м/с', 'v'), f('omega', 'Вращение', 'рад/с', 'ω'), ...derivedFields];
}
export const bindingKey = (id: string, key: string) => `${id}:${key}`;
export function readField(o: Item, key: string): number {
  if (key.startsWith('derived.')) return 'derived' in o ? o.derived?.[Number(key.slice(8))] ?? 0 : 0;
  if (key === 'vector.magnitude' || key === 'vector.angle') return key === 'vector.magnitude' ? magnitude((o as Extract<Item, { vector: unknown }>).vector) : direction((o as Extract<Item, { vector: unknown }>).vector);
  if (key === 'velocity.magnitude' || key === 'velocity.angle') { const v = { x: (o as Extract<Item, { vx: unknown }>).vx, y: (o as Extract<Item, { vy: unknown }>).vy }; return key === 'velocity.magnitude' ? magnitude(v) : direction(v); }
  if (key === 'radius' && ['circle', 'pulley', 'bearing'].includes(o.kind)) return (o as Extract<Item, { w: number }>).w / 2;
  if (key.startsWith('vector.')) return (o as Extract<Item, { vector: unknown }>).vector[key.slice(7) as 'x' | 'y'];
  return (o as unknown as Record<string, number>)[key];
}
export function writeField(o: Item, key: string, value: number): Item {
  if (key.startsWith('derived.')) return o;
  if (key === 'vector.magnitude' || key === 'vector.angle') { const v = (o as Extract<Item, { vector: unknown }>).vector; return { ...o, vector: key === 'vector.magnitude' ? polar(value, direction(v)) : polar(magnitude(v), value) } as Item; }
  if (key === 'velocity.magnitude' || key === 'velocity.angle') { const v = { x: (o as Extract<Item, { vx: unknown }>).vx, y: (o as Extract<Item, { vy: unknown }>).vy }; const next = key === 'velocity.magnitude' ? polar(value, direction(v)) : polar(magnitude(v), value); return { ...o, vx: next.x, vy: next.y } as Item; }
  if (key === 'radius' && ['circle', 'pulley', 'bearing'].includes(o.kind)) return { ...o, w: value * 2, h: value * 2 } as Item;
  if (key.startsWith('vector.')) return { ...o, vector: { ...(o as Extract<Item, { vector: unknown }>).vector, [key.slice(7)]: value } } as Item;
  return { ...o, [key]: value } as Item;
}
function freshId(variables: Variable[]) { let n = 1; while (variables.some(v => v.id === `v${n}`)) n++; return `v${n}`; }
function symbolBase(field: Field) { return field.letter + (field.key === 'vector.x' || field.key === 'vx' || (field.computed && Number(field.key.slice(8)) < 18 && Number(field.key.slice(8)) % 2 === 0) ? 'x' : field.key === 'vector.y' || field.key === 'vy' || (field.computed && Number(field.key.slice(8)) < 18) ? 'y' : ''); }
const symbolIndex = (o: Item) => Number(o.index ?? o.id) || 1;
const categorySymbol: Record<Item['kind'], string> = {
  rect: '', circle: '', surface: 'пов', rod: 'р', bearing: 'под', pulley: 'бл',
  spring: 'пр', rope: 'н', force: 'сил', velocity: 'скор', acceleration: 'уск',
};
function freshSymbol(symbols: Set<string>, preferred: string) { let symbol = preferred; while (symbols.has(symbol)) symbol += '′'; symbols.add(symbol); return symbol; }
function automaticSymbol(symbols: Set<string>, o: Item, field: Field) {
  const preferred = `${symbolBase(field)}${categorySymbol[o.kind]}${o.kind === 'surface' ? '' : symbolIndex(o)}`;
  return freshSymbol(symbols, preferred);
}
function halfLength(variable: Variable): Variable {
  return {
    ...variable,
    value: variable.value / 2,
    range: variable.range && { min: variable.range.min / 2, max: variable.range.max / 2, step: variable.range.step / 2 },
    graph: variable.graph && { ...variable.graph, points: variable.graph.points.map(p => ({ ...p, y: p.y / 2, ...(p.inY === undefined ? {} : { inY: p.inY / 2 }), ...(p.outY === undefined ? {} : { outY: p.outY / 2 }) })) },
  };
}
function migrateRoundBindings(items: Item[], variables: Variable[], bindings: Record<string, string>) {
  const byId = new Map(variables.map((v, i) => [v.id, i]));
  const obsoleteIds = new Set<string>();
  for (const o of items) {
    if (!['circle', 'pulley', 'bearing'].includes(o.kind)) continue;
    const widthKey = bindingKey(o.id, 'w'), heightKey = bindingKey(o.id, 'h'), radiusKey = bindingKey(o.id, 'radius');
    const variableId = bindings[widthKey];
    if (bindings[heightKey]) obsoleteIds.add(bindings[heightKey]);
    delete bindings[heightKey];
    delete bindings[widthKey];
    if (!variableId || !byId.has(variableId)) continue;
    if (Object.values(bindings).includes(variableId)) continue;
    const index = byId.get(variableId)!;
    const variable = variables[index], oldSymbol = `w${symbolIndex(o)}`;
    const legacyAutomatic = variable.auto === undefined && (variable.symbol === oldSymbol || new RegExp(`^${oldSymbol}[2-9][0-9]*$`).test(variable.symbol));
    variables[index] = halfLength({ ...variable, ...(legacyAutomatic ? { auto: true } : {}) });
    bindings[radiusKey] = variableId;
  }
  return obsoleteIds;
}
const defaultVisible = (o: Item, field: Field) =>
  (o.kind !== 'surface' && field.key === 'mass') || field.key === 'vector.magnitude';
const autoPublic = (field: Field) =>
  ['mass', 'mu', 'restitution', 'velocity.magnitude', 'omega', 'length', 'stiffness', 'damping', 'vector.magnitude'].includes(field.key);
export function ensureVariables(scene: VariableScene): VariableScene {
  let variables = (scene.variables || []).map(v => ({ ...v, mode: variableMode(v) })), bindings = { ...(scene.bindings || {}) };
  const obsoleteIds = migrateRoundBindings(scene.items, variables, bindings);
  const entries = scene.items.flatMap(o => fields(o).map(field => ({ o, field })));
  const supportedBindings = new Set(entries.map(({ o, field }) => bindingKey(o.id, field.key)));
  for (const key of Object.keys(bindings)) if (!supportedBindings.has(key)) {
    obsoleteIds.add(bindings[key]);
    delete bindings[key];
  }
  const supportedDerived = new Set(entries.filter(({ field }) => field.computed).map(({ o, field }) => `${o.id}:${field.key}`));
  variables = variables.filter(v => !v.derived || supportedDerived.has(`${v.derived.itemId}:derived.${v.derived.index}`));
  const boundIds = new Set(Object.values(bindings));
  variables = variables.filter(v => !(v.auto || obsoleteIds.has(v.id)) || boundIds.has(v.id));
  const ids = new Set(variables.map(v => v.id));
  const indices = new Map(variables.map((v, i) => [v.id, i]));
  const ordered = [...entries.filter(x => !x.field.computed), ...entries.filter(x => x.field.computed)];
  const automatic = new Set(ordered.flatMap(({ o, field }) => {
    const id = bindings[bindingKey(o.id, field.key)], v = variables[indices.get(id) ?? -1];
    const legacy = `${symbolBase(field)}${o.id}`;
    const oldIndex = o.kind === 'surface' && o.index !== undefined ? `${symbolBase(field)}${o.index}` : legacy;
    return v && (v.auto || (v.auto === undefined && (v.symbol === legacy || v.symbol === oldIndex || new RegExp(`^${legacy}[2-9][0-9]*$`).test(v.symbol)))) ? [id] : [];
  }));
  const symbols = new Set(variables.filter(v => !automatic.has(v.id)).map(v => v.symbol));
  const assigned = new Set<string>();
  let next = Math.max(0, ...variables.map(v => Number(v.id.slice(1)) || 0)) + 1;
  for (const { o, field } of ordered) {
    const key = bindingKey(o.id, field.key);
    if (bindings[key] && ids.has(bindings[key])) {
      const index = indices.get(bindings[key]) ?? -1;
      if (index >= 0 && automatic.has(bindings[key]) && !assigned.has(bindings[key])) {
        variables[index] = { ...variables[index], symbol: automaticSymbol(symbols, o, field), auto: true };
        assigned.add(bindings[key]);
      }
      if (index >= 0 && automatic.has(bindings[key]) && !variables[index].visibilityLocked)
        variables[index] = { ...variables[index], visible: defaultVisible(o, field) || (autoPublic(field) && variables[index].visible) };
      continue;
    }
    const value = readField(o, field.key);
    if (!Number.isFinite(value)) continue;
    const id = `v${next++}`;
    const symbol = automaticSymbol(symbols, o, field);
    variables.push({ id, symbol, value, unit: field.unit, visible: defaultVisible(o, field), mode: 'number', auto: true, ...(field.computed ? { derived: { itemId: o.id, index: Number(field.key.slice(8)) } } : {}) });
    indices.set(id, variables.length - 1);
    ids.add(id);
    bindings[key] = id;
  }
  const live = new Set(scene.items.map(o => o.id));
  for (const key of Object.keys(bindings)) if (!live.has(key.split(':')[0])) delete bindings[key];
  variables = variables.filter(v => !v.derived || live.has(v.derived.itemId));
  const variableIds = new Set(variables.map(v => v.id));
  variables = variables.map(v => v.graph?.source !== 'time' && v.graph && !variableIds.has(v.graph.source) ? { ...v, graph: undefined, mode: 'number' } : v);
  return { ...scene, variables, bindings };
}
export function setVariable(scene: VariableScene, id: string, value: number): VariableScene {
  if (!Number.isFinite(value) || Math.abs(value) > 1e5) throw Error('Число вне допустимого диапазона');
  const s = ensureVariables(scene);
  const target = s.variables!.find(v => v.id === id);
  if (!target) return s;
  if (target.derived) throw Error('Вычисляемая переменная доступна только для чтения');
  if (variableMode(target) === 'graph') throw Error('Значение задаётся графиком');
  for (const o of s.items) for (const field of fields(o)) if (s.bindings![bindingKey(o.id, field.key)] === id) {
    const physical = convertUnit(value, target.unit, field.unit);
    if (physical < (field.min ?? -1e5) || physical > (field.max ?? 1e5)) throw Error(`${field.label}: недопустимое значение`);
  }
  const items = s.items.map(o => fields(o).reduce<Item>((out, field) => {
    if (s.bindings![bindingKey(o.id, field.key)] !== id) return out;
    const physical = convertUnit(value, target.unit, field.unit);
    if (field.key === 'vector.magnitude' && 'vector' in out && magnitude(out.vector) === 0) {
      const angleId = s.bindings![bindingKey(o.id, 'vector.angle')], angleVariable = s.variables!.find(v => v.id === angleId);
      return { ...out, vector: polar(physical, angleVariable ? convertUnit(angleVariable.value, angleVariable.unit, '°') : 0) };
    }
    if (field.key === 'velocity.magnitude' && 'vx' in out && Math.hypot(out.vx, out.vy) === 0) {
      const angleId = s.bindings![bindingKey(o.id, 'velocity.angle')], angleVariable = s.variables!.find(v => v.id === angleId);
      const next = polar(physical, angleVariable ? convertUnit(angleVariable.value, angleVariable.unit, '°') : 0);
      return { ...out, vx: next.x, vy: next.y };
    }
    return writeField(out, field.key, physical);
  }, o));
  const refreshed = new Map<string, number>([[id, value]]);
  for (const o of items) if (o !== s.items.find(old => old.id === o.id)) for (const field of fields(o)) {
    if (!field.key.startsWith('vector.') && !field.key.startsWith('velocity.') && !['vx', 'vy'].includes(field.key)) continue;
    const bound = s.bindings![bindingKey(o.id, field.key)];
    if (bound) {
      const variable = s.variables!.find(v => v.id === bound)!;
      refreshed.set(bound, field.key.endsWith('.angle') && readField(o, field.key.replace('.angle', '.magnitude')) === 0 ? (bound === id ? value : variable.value) : convertUnit(readField(o, field.key), field.unit, variable.unit));
    }
  }
  return { ...s, items, variables: s.variables!.map(v => refreshed.has(v.id) ? { ...v, value: refreshed.get(v.id)!, visible: v.visible || (!v.visibilityLocked && refreshed.get(v.id)! !== 0 && s.items.some(o => fields(o).some(field => s.bindings![bindingKey(o.id, field.key)] === v.id && autoPublic(field)))) } : v) };
}
export function saveVariable(scene: VariableScene, draft: { id?: string; symbol: string; value: number; unit: string }): VariableScene {
  const s = ensureVariables(scene), symbol = draft.symbol.trim(), unit = draft.unit.trim();
  const existing = s.variables!.find(v => v.id === draft.id);
  if (!symbol || /\s/u.test(symbol) || symbol.length > 40) throw Error('Литера: от 1 до 40 символов без пробелов');
  if (unit.length > 30) throw Error('Единица измерения слишком длинная');
  if (!knownUnit(unit) && unit !== (existing && displayUnit(existing))) throw Error('Выберите единицу из списка');
  if (!Number.isFinite(draft.value) || Math.abs(draft.value) > 1e5) throw Error('Значение вне допустимого диапазона');
  if (s.variables!.some(v => v.symbol === symbol && v.id !== draft.id)) throw Error('Литера уже занята');
  if (draft.id) {
    const variable = s.variables!.find(v => v.id === draft.id);
    if (!variable || variable.derived) throw Error('Вычисляемую переменную нельзя изменить');
    const bound = Object.values(s.bindings!).includes(draft.id);
    if (bound && !compatibleUnits(variable.unit, unit)) throw Error('Единица не подходит связанному свойству');
    const sameFamily = compatibleUnits(variable.unit, unit);
    if (!sameFamily && variableMode(variable) !== 'number') throw Error('Сначала переключитесь в числовой режим');
    const updated = variableMode(variable) === 'number' ? setVariable(s, draft.id, sameFamily ? convertUnit(draft.value, unit, variable.unit) : draft.value) : s;
    return { ...updated, variables: updated.variables!.map(v => v.id === draft.id ? { ...v, symbol, unit: sameFamily ? v.unit : unit, displayUnit: sameFamily ? unit : undefined, auto: false } : v) };
  }
  return { ...s, variables: [...s.variables!, { id: `v${Math.max(0, ...s.variables!.map(v => Number(v.id.slice(1)) || 0)) + 1}`, symbol, value: draft.value, unit, displayUnit: unit, visible: true, mode: 'number' }] };
}
function fieldRole(o: Item, key: string): string {
  if (o.kind === 'velocity' && key.startsWith('vector.')) return ({ 'vector.magnitude': 'velocity.magnitude', 'vector.angle': 'velocity.angle', 'vector.x': 'vx', 'vector.y': 'vy' } as Record<string, string>)[key];
  if (key === 'vector.x' || key === 'vector.y') return `${o.kind}:${key}`;
  return key;
}
export function bindableVariables(scene: VariableScene, itemId: string, key: string): Variable[] {
  const o = scene.items.find(item => item.id === itemId), field = o && fields(o).find(f => f.key === key);
  if (!o || !field || field.computed) return [];
  const bindings = scene.bindings || {};
  const localIds = new Set(Object.entries(bindings).filter(([binding]) => binding.startsWith(`${itemId}:`)).map(([, id]) => id));
  const role = fieldRole(o, key);
  return (scene.variables || []).filter(v => !v.derived && compatibleUnits(field.unit, v.unit) && (v.visible || localIds.has(v.id)) &&
    Object.entries(bindings).every(([binding, id]) => {
      if (id !== v.id) return true;
      const colon = binding.indexOf(':'), owner = scene.items.find(item => item.id === binding.slice(0, colon));
      return !owner || fieldRole(owner, binding.slice(colon + 1)) === role;
    }));
}
export function bindVariable(scene: VariableScene, itemId: string, key: string, variableId: string): VariableScene {
  const s = ensureVariables(scene), v = s.variables!.find(v => v.id === variableId), o = s.items.find(o => o.id === itemId), field = o && fields(o).find(f => f.key === key);
  if (!v || !o || !field || !bindableVariables(s, itemId, key).some(candidate => candidate.id === variableId)) throw Error('Несовместимая или скрытая переменная');
  const physical = convertUnit(v.value, v.unit, field.unit);
  if (physical < (field.min ?? -1e5) || physical > (field.max ?? 1e5)) throw Error('Значение не подходит свойству');
  return setVariable({ ...s, bindings: { ...s.bindings, [bindingKey(itemId, key)]: variableId } }, variableId, v.value);
}
export function syncVariables(before: VariableScene, after: VariableScene): VariableScene {
  let s = ensureVariables(after);
  const old = new Map(before.items.map(o => [o.id, o]));
  const changed = new Map<string, number>();
  for (const o of after.items) for (const field of fields(o)) {
    const previous = old.get(o.id), id = s.bindings![bindingKey(o.id, field.key)];
    if (previous && id && !field.computed && !field.key.startsWith('vector.') && !field.key.startsWith('velocity.') && readField(o, field.key) !== readField(previous, field.key)) changed.set(id, convertUnit(readField(o, field.key), field.unit, s.variables!.find(v => v.id === id)!.unit));
  }
  for (const [id, value] of changed) s = setVariable(s, id, value);
  for (const o of after.items) {
    const previous = old.get(o.id);
    if (previous && 'vector' in o && 'vector' in previous && (o.vector.x !== previous.vector.x || o.vector.y !== previous.vector.y)) {
      for (const key of ['vector.magnitude', 'vector.angle']) {
        const id = s.bindings![bindingKey(o.id, key)];
        if (id) s = setVariable(s, id, convertUnit(readField(o, key), fields(o).find(f => f.key === key)!.unit, s.variables!.find(v => v.id === id)!.unit));
      }
    }
    if (previous && 'vx' in o && 'vx' in previous && (o.vx !== previous.vx || o.vy !== previous.vy)) {
      for (const key of ['velocity.magnitude', 'velocity.angle']) {
        const id = s.bindings![bindingKey(o.id, key)];
        if (id) s = setVariable(s, id, convertUnit(readField(o, key), fields(o).find(f => f.key === key)!.unit, s.variables!.find(v => v.id === id)!.unit));
      }
    }
  }
  return s;
}
export function removeVariable(scene: VariableScene, id: string): VariableScene {
  let s = ensureVariables(scene);
  const target = s.variables!.find(v => v.id === id);
  if (!target) return s;
  let variables = s.variables!.filter(v => v.id !== id);
  const bindings = { ...s.bindings };
  for (const o of s.items) for (const field of fields(o)) {
    const key = bindingKey(o.id, field.key);
    if (bindings[key] !== id) continue;
    const next = freshId(variables);
    variables = [...variables, { id: next, symbol: automaticSymbol(new Set(variables.map(v => v.symbol)), o, field), value: readField(o, field.key), unit: field.unit, visible: false, auto: true, ...(field.computed ? { derived: { itemId: o.id, index: Number(field.key.slice(8)) } } : {}) }];
    bindings[key] = next;
  }
  variables = variables.map(v => v.graph?.source === id ? { ...v, graph: undefined, mode: 'number' } : v);
  s = { ...s, variables, bindings };
  return s;
}
export function valueAt(points: Point[], x: number): number {
  if (!points.length) return 0;
  if (x <= points[0].x) return points[0].y;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (x > b.x) continue;
    if (b.break) return x < b.x ? a.y : b.y;
    const t = (x - a.x) / (b.x - a.x), u = 1 - t,
      outY = a.outY ?? a.y + (b.y - a.y) / 3,
      inY = b.inY ?? a.y + (b.y - a.y) * 2 / 3;
    return u*u*u*a.y + 3*u*u*t*outY + 3*u*t*t*inY + t*t*t*b.y;
  }
  return points.at(-1)!.y;
}
