export type WasmEngine = {
  HEAPF64: Float64Array;
  HEAPU8: Uint8Array;
  _engine_input(): number;
  _engine_output(): number;
  _engine_formulas(): number;
  _engine_reset(bodies: number, links: number, g: number): number;
  _engine_tick(drag: number, x: number, y: number): number;
  _engine_sample(t: number): number;
  _engine_time(): number;
  _engine_body(i: number, field: number, v: number): number;
  _engine_force(
    i: number,
    fx: number,
    fy: number,
    ax: number,
    ay: number,
  ): number;
  _engine_link(i: number, l: number, k: number, d: number): number;
  _engine_gravity(g: number): number;
  _engine_trajectory(i: number, enabled: number): number;
  _engine_gravity_vector(i: number, x: number, y: number): number;
  _engine_observables(): number;
  _engine_relax(): number;
};
export const STEP = 1 / 240;
// Bound catch-up work. Report lost wall time instead of increasing physical dt.
export class FixedClock {
  remainder = 0;
  dropped = 0;
  consume(elapsed: number) {
    if (!Number.isFinite(elapsed) || elapsed < 0)
      throw Error("Invalid elapsed time");
    const total = this.remainder + elapsed;
    this.dropped += Math.max(0, total - 0.1);
    this.remainder = Math.min(total, 0.1);
    const count = Math.min(24, Math.floor((this.remainder + 1e-10) / STEP));
    this.remainder = Math.max(0, this.remainder - count * STEP);
    return count;
  }
}
