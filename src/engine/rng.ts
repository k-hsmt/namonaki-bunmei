/** Small deterministic generator; suitable for reproducible fiction, not security. */
export class SeededRng {
  constructor(public state: number) { this.state = state >>> 0; }
  next(): number {
    // Mulberry32, with mutable state retained for save/resume.
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  between(min: number, max: number): number { return min + (max - min) * this.next(); }
  int(min: number, max: number): number { return Math.floor(this.between(min, max + 1)); }
  normal(): number {
    // Sum of three centered independent draws; bounded, zero-centered.
    return (this.next() + this.next() + this.next() - 1.5) * 1.1547005;
  }
}

export function hash01(x: number, y: number, seed: number): number {
  let k = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)) | 0;
  k ^= k >>> 13;
  k = Math.imul(k, 1274126177);
  k ^= k >>> 16;
  return (k >>> 0) / 4294967295;
}

function smooth(x: number): number { return x * x * (3 - 2 * x); }

export function valueNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x); const iy = Math.floor(y);
  const tx = smooth(x - ix); const ty = smooth(y - iy);
  const a = hash01(ix, iy, seed); const b = hash01(ix + 1, iy, seed);
  const c = hash01(ix, iy + 1, seed); const d = hash01(ix + 1, iy + 1, seed);
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}
