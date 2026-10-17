import * as THREE from "three";

// Procedural cloud-puff atlas (2x2 cells). Generated once at load so no
// texture assets are needed. Channels:
//   R = density (alpha)
//   G = self-shadowed light term (light arrives from the top of the sprite)
//   B = fine detail noise used to break up the shading

const CELL = 256;
const GRID = 2;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoise(seed: number) {
  const rand = mulberry32(seed);
  const size = 256;
  const perm = new Uint8Array(size * 2);
  const vals = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    perm[i] = i;
    vals[i] = rand();
  }
  for (let i = size - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = perm[i]!;
    perm[i] = perm[j]!;
    perm[j] = t;
  }
  for (let i = 0; i < size; i++) perm[i + size] = perm[i]!;
  const fade = (t: number) => t * t * (3 - 2 * t);
  const v = (x: number, y: number) => vals[perm[(perm[x & 255]! + y) & 511]!]!;
  return (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = fade(x - xi);
    const yf = fade(y - yi);
    const a = v(xi, yi);
    const b = v(xi + 1, yi);
    const c = v(xi, yi + 1);
    const d = v(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
}

export function createCloudAtlas(): THREE.DataTexture {
  const W = CELL * GRID;
  const data = new Uint8Array(W * W * 4);
  const noise = makeNoise(7);
  const fbm = (x: number, y: number) => {
    let s = 0;
    let amp = 0.5;
    let f = 1;
    for (let o = 0; o < 5; o++) {
      s += noise(x * f, y * f) * amp;
      f *= 2.03;
      amp *= 0.5;
    }
    return s;
  };

  const density = new Float32Array(CELL * CELL);

  for (let cell = 0; cell < GRID * GRID; cell++) {
    const rand = mulberry32(101 + cell * 977);
    // Soft, domain-warped mass: a flat-bottomed lobe eroded by fbm so the
    // sprites read as torn vapour rather than round puffs.
    const lobes: { x: number; y: number; r: number }[] = [];
    const n = 3 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      lobes.push({ x: 0.3 + rand() * 0.4, y: 0.42 + rand() * 0.18, r: 0.2 + rand() * 0.12 });
    }
    const ox = rand() * 100;
    const oy = rand() * 100;

    for (let y = 0; y < CELL; y++) {
      for (let x = 0; x < CELL; x++) {
        const u = x / (CELL - 1);
        const vv = y / (CELL - 1);
        const wx = u + (fbm(u * 3 + ox, vv * 3 + oy) - 0.5) * 0.28;
        const wy = vv + (fbm(u * 3 + oy + 7, vv * 3 + ox) - 0.5) * 0.22;
        let m = 0;
        for (const lb of lobes) {
          const dx = (wx - lb.x) / lb.r;
          const dy = (wy - lb.y) / (lb.r * (wy < lb.y ? 0.75 : 1.05));
          m = Math.max(m, 1 - Math.sqrt(dx * dx + dy * dy));
        }
        m = Math.max(0, m);
        const n1 = fbm(u * 6 + ox, vv * 6 + oy);
        let d = m * 1.25 * (0.35 + n1 * 1.1) - 0.08;
        d = Math.max(0, d);
        d = d * d * (3 - 2 * Math.min(1, d)); // soften the core
        const ex = Math.min(u, 1 - u);
        const ey = Math.min(vv, 1 - vv);
        const edge = Math.min(1, Math.min(ex, ey) / 0.14);
        density[y * CELL + x] = Math.max(0, Math.min(1, d * edge * edge * 1.1));
      }
    }

    const cx = (cell % GRID) * CELL;
    const cy = Math.floor(cell / GRID) * CELL;
    const sample = (x: number, y: number) => {
      const xx = Math.max(0, Math.min(CELL - 1, x));
      const yy = Math.max(0, Math.min(CELL - 1, y));
      return density[yy * CELL + xx]!;
    };
    for (let y = 0; y < CELL; y++) {
      for (let x = 0; x < CELL; x++) {
        const d = density[y * CELL + x]!;
        // March toward the light (towards +v, i.e. the top of the sprite in GL uv space).
        let occ = 0;
        for (let s = 1; s <= 6; s++) occ += sample(x - s * 2, y + s * 7);
        const lit = 0.35 + 0.65 * Math.exp(-occ * 0.7) * (0.4 + 0.6 * Math.min(1, d / 0.35));
        const detail = fbm(x / 18 + cell * 13, y / 18);
        const i = ((cy + y) * W + (cx + x)) * 4;
        data[i] = Math.round(d * 255);
        data[i + 1] = Math.round(Math.min(1, lit) * 255);
        data[i + 2] = Math.round(detail * 255);
        data[i + 3] = 255;
      }
    }
  }

  const tex = new THREE.DataTexture(data, W, W, THREE.RGBAFormat);
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}
