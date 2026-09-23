import type { BodyItem, Patch, Scene } from "./model";
import { body } from "./model";
import { convertUnit, fields, readField } from './variables';
export type Metrics = {
  time: number;
  fps: number;
  cost: number;
  dropped: number;
  settled: boolean;
  residual: number;
};
export class Simulation {
  private worker = new Worker(new URL("./physics.worker.ts", import.meta.url), {
    type: "module",
  });
  private raf = 0;
  private stopped = false;
  private waiting = false;
  private last = 0;
  private pending = 0;
  private edits: { id: string; patch: Patch }[] = [];
  private config: Scene;
  private state: Float64Array | undefined;
  private rendered: Float64Array | undefined;
  private forceSamples: BodyItem["forceSamples"][] = [];
  private derived: Float64Array | undefined;
  private variableValues: number[] | undefined;
  private bindingsByVariable = new Map<string, [string, string]>();
  private metrics: Metrics = {
    time: 0,
    fps: 0,
    cost: 0,
    dropped: 0,
    settled: false,
    residual: 0,
  };
  private frames = 0;
  private measure = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private getDrag: () => { id: string; x: number; y: number } | null;
  private onFrame: (scene: Scene, display: Scene, metrics: Metrics) => void;
  private onError: (message: string) => void;
  private visibility = () => {
    this.last = 0;
    this.pending = 0;
  };
  constructor(
    scene: Scene,
    getDrag: () => { id: string; x: number; y: number } | null,
    onFrame: (scene: Scene, display: Scene, metrics: Metrics) => void,
    onError: (message: string) => void,
  ) {
    this.config = structuredClone(scene);
    for (const [binding, id] of Object.entries(scene.bindings || {})) {
      const [itemId, key] = binding.split(':');
      if (!this.bindingsByVariable.has(id)) this.bindingsByVariable.set(id, [itemId, key]);
    }
    this.getDrag = getDrag;
    this.onFrame = onFrame;
    this.onError = onError;
    document.addEventListener("visibilitychange", this.visibility);
  }
  start(mode: "dynamic" | "static" | "preview" = "dynamic") {
    return new Promise<void>((resolve, reject) => {
      const timeout = (this.timer = setTimeout(() => {
        reject(Error("Не удалось загрузить WebAssembly за 20 секунд."));
        this.stop();
      }, 20000));
      this.worker.onerror = (e) => {
        clearTimeout(timeout);
        const message = e.message || "Ошибка загрузки WASM";
        reject(Error(message));
        this.onError(message);
        this.stop();
      };
      this.worker.onmessage = ({ data }) => {
        if (this.stopped) return;
        if (data.type === "ready") {
          clearTimeout(timeout);
          resolve();
          if (mode !== "preview") this.raf = requestAnimationFrame(this.frame);
          return;
        }
        if (data.type === "error") {
          clearTimeout(timeout);
          reject(Error(data.message));
          this.onError(data.message);
          this.stop();
          return;
        }
        if (data.type === "frame") {
          this.waiting = false;
          this.state = data.state;
          this.rendered = data.rendered;
          this.derived = data.derived;
          this.forceSamples = data.forceSamples;
          this.variableValues = data.variableValues;
          this.metrics = {
            ...this.metrics,
            time: data.time,
            cost: data.cost,
            dropped: data.dropped,
            settled: !!data.settled,
            residual: data.residual,
          };
          if (mode === "preview") {
            this.onFrame(this.sceneAt(data.state), this.sceneAt(data.rendered), this.metrics);
            this.stop();
          }
        }
      };
      this.worker.postMessage({ type: "init", scene: this.config, mode });
    });
  }
  edit(id: string, patch: Patch) {
    this.edits.push({ id, patch });
    this.metrics.settled = false;
    Object.assign(
      this.config.items.find((o) => o.id === id)!,
      patch,
    );
    const item = this.config.items.find(o => o.id === id)!;
    for (const field of fields(item)) {
      const variableId = this.config.bindings?.[`${id}:${field.key}`];
      const variable = this.config.variables?.find(v => v.id === variableId);
      if (variable && !field.computed) variable.value = convertUnit(readField(item, field.key), field.unit, variable.unit);
    }
  }
  private sceneAt(values: Float64Array) {
    let i = 0;
    const items = this.config.items.map((o) => {
        if (!body(o)) return o;
        const index = i++;
        const [x, y, angle, vx, vy, omega] = values.subarray(
          index * 6,
          (index + 1) * 6,
        );
        return {
          ...o,
          x,
          y,
          angle,
          vx,
          vy,
          omega,
          forceSamples: this.forceSamples[index],
          derived: this.derived
            ? Array.from(this.derived.subarray(index * 20, (index + 1) * 20))
            : undefined,
        };
      });
    const byId = new Map(items.map(o => [o.id, o]));
    return {
      ...this.config,
      variables: this.config.variables?.map((v, j) => {
        const computed = v.derived && byId.get(v.derived.itemId);
        if (computed && body(computed)) return { ...v, value: computed.derived?.[v.derived!.index] ?? 0 };
        const binding = this.bindingsByVariable.get(v.id);
        if (binding) {
          const [itemId, key] = binding;
          const item = byId.get(itemId);
          if (item && body(item) && ['x', 'y', 'angle', 'vx', 'vy', 'omega', 'velocity.magnitude', 'velocity.angle'].includes(key)) return { ...v, value: convertUnit(readField(item, key), fields(item).find(f => f.key === key)!.unit, v.unit) };
        }
        return { ...v, value: this.variableValues?.[j] ?? v.value };
      }),
      items,
    };
  }
  private frame = (now: number) => {
    if (this.stopped) return;
    if (document.hidden) {
      this.last = 0;
      this.pending = 0;
      this.raf = requestAnimationFrame(this.frame);
      return;
    }
    const elapsed = this.last ? (now - this.last) / 1000 : 0;
    this.last = now;
    this.pending += elapsed;
    if (!this.measure) this.measure = now;
    this.frames++;
    if (now - this.measure >= 500) {
      this.metrics.fps = Math.round(
        (this.frames * 1000) / (now - this.measure),
      );
      this.frames = 0;
      this.measure = now;
    }
    if (!this.waiting && !this.metrics.settled) {
      this.waiting = true;
      this.worker.postMessage({
        type: "frame",
        elapsed: this.pending,
        drag: this.getDrag(),
        edits: this.edits,
      });
      this.pending = 0;
      this.edits = [];
    }
    if (this.state && this.rendered)
      this.onFrame(
        this.sceneAt(this.state),
        this.sceneAt(this.rendered),
        this.metrics,
      );
    this.raf = requestAnimationFrame(this.frame);
  };
  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    cancelAnimationFrame(this.raf);
    this.worker.terminate();
    document.removeEventListener("visibilitychange", this.visibility);
  }
}
