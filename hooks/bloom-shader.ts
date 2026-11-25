import {
  abs, atan, buffer, clamp, composer, cos, dot, floor, fract, int, length, max, min, mix, normalize, picture,
  pow, range, shader, signed, sin, size, smoothstep, table, time, vec2, vec3, vec4,
} from 'claude-code/shader'
import type { vec2 as V2, vec4 as V4 } from 'claude-code/shader'

// A field of shaded 3D roses, rendered as tiny colored ASCII characters.
// Pass 1 works out each character cell's color and glyph; pass 2 draws
// the glyphs from Departure Mono's own pixels.

const CW = 7 // cell width in points: one Departure Mono advance
const CH = 10 // cell height in points
const SLOTS = 7
const PERIOD = 22
const ACTIVE = 0.5

// " .:-=+*#%@" from Departure Mono by Helena Zhang (SIL Open Font License 1.1),
// as rendered at its native 11px: 7 columns by 8 rows, rows 0-3 in the first
// int and rows 4-7 in the second, bit = row * 7 + column, row 0 at the top.
const GLYPHS = table(
  [[0, 0], [0, 16908288], [16908288, 16908288], [0, 28], [130023424, 7936], [16908288, 132158], [88544520, 8], [44012584, 21143444], [34153796, 72651272], [92803356, 42636586]],
  'int',
)

// Two-tone neon palettes: petal heart color, then petal tip color.
const HEART = table([
  [1.0, 0.05, 0.6],
  [0.0, 0.55, 1.0],
  [1.0, 0.1, 0.05],
  [0.55, 0.05, 1.0],
  [1.0, 0.35, 0.0],
  [0.0, 1.0, 0.55],
  [1.0, 0.0, 0.85],
  [1.0, 0.8, 0.0],
])
const TIP = table([
  [1.0, 0.75, 0.2],
  [0.2, 1.0, 1.0],
  [1.0, 0.85, 0.1],
  [1.0, 0.35, 0.9],
  [1.0, 0.95, 0.3],
  [0.8, 1.0, 0.2],
  [0.3, 0.8, 1.0],
  [1.0, 0.25, 0.4],
])
// Each slot keeps to its own zone, so open flowers never pile up.
// Sides and top only, clear of the conversation and the prompt box.
const ZONES = table([
  [0.13, 0.8],
  [0.87, 0.5],
  [0.15, 0.3],
  [0.5, 0.86],
  [0.86, 0.8],
  [0.12, 0.5],
  [0.85, 0.3],
])
// The palette: ink black ground, then prussian, dusk, lavender grey, alabaster.
const INK = vec3(0.051, 0.106, 0.165)
const PRUSSIAN = vec3(0.106, 0.149, 0.231)
const DUSK = vec3(0.255, 0.353, 0.467)
const LAVENDER = vec3(0.467, 0.553, 0.663)
const ALABASTER = vec3(0.878, 0.882, 0.867)

const CORE = table([
  [1.0, 0.95, 0.2],
  [1.0, 1.0, 1.0],
  [1.0, 0.5, 0.0],
  [0.2, 1.0, 0.4],
])

function hash1(n: number): number {
  return fract(sin(n * 127.1 + 1.3) * 43758.5453)
}

function hash2(p: V2): number {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453)
}

// One rose at q (in units of its radius): rgb, and coverage in a.
function rose(q: V2, open: number, seed: number, pal: number): V4 {
  const r = length(q)
  const a = atan(q.y, q.x)
  const core = 0.09 + 0.05 * open
  let hit = -1
  let rin = core
  let rout = 0
  let lobe = 0
  let petals = 3
  let prev = core
  for (const l of range(5)) {
    const n = floor(3 + l * 0.6 + hash1(seed + l) * 0.9)
    const ph = seed * 3 + l * 2.4
    const lag = l * 0.13
    const openL = clamp((open - lag) / (1 - lag), 0, 1)
    const s = (0.24 + 0.17 * l) * (0.3 + 0.7 * openL)
    const cs = abs(cos(n * a * 0.5 + ph))
    const dep = 0.1 + 0.3 * openL
    const R = s * (1 - dep + dep * pow(cs, 0.7))
    if (hit < 0 && r < R) {
      hit = l
      rout = R
      rin = prev
      lobe = cs
      petals = n
    }
    prev = R
  }
  if (hit < 0) {
    return vec4(0)
  }
  const heart = vec3(HEART.at(pal))
  const tip = vec3(TIP.at(pal))
  if (r < core) {
    // A tight dark spiral at the heart, with a few lit edges.
    const swirl = 0.5 + 0.5 * sin(a * 2 + r * 70 + seed)
    return vec4(heart * (0.12 + 0.55 * pow(swirl, 3)), 1)
  }
  const t = clamp((r - rin) / max(rout - rin, 0.001), 0, 1)
  // Each petal runs from a dark tucked base to a bright curled rim,
  // so the layers read as crescents against each other's shadows.
  const ramp = pow(t, 1.25)
  const edge = 1 - 0.35 * smoothstep(0.94, 1, t)
  const lit = 0.72 + 0.28 * cos(a - 2.2)
  const crease = mix(0.55, 1, smoothstep(0, 0.2, lobe))
  const sheen = 0.94 + 0.06 * sin(a * petals * 4 + r * 12)
  const hue = mix(heart * 0.55, tip, clamp(ramp * 1.1 + hit * 0.06, 0, 1))
  let col = vec3(hue * (0.2 + 0.9 * ramp) * edge * lit * crease * sheen)
  col = vec3(col + tip * pow(smoothstep(0.8, 0.95, t), 2) * 0.25 * lit)
  return vec4(col, 1)
}

// Pass 1: one texel per character cell, holding its color and glyph.
const field = buffer({ size: [420, 220], filter: 'nearest' }, p => {
  const cellPt = vec2((p.cell + 0.5) * vec2(CW, CH))
  let best = vec3(0)
  let covered = 0
  for (const s of range(SLOTS)) {
    const clock = time + s * (PERIOD / SLOTS) + 3
    const ph = fract(clock / PERIOD)
    const cyc = floor(clock / PERIOD)
    const life = clamp(ph / ACTIVE, 0, 1)
    if (ph < ACTIVE) {
      const seed = hash1(s * 13.1 + cyc * 7.7) * 100
      const open = smoothstep(0, 0.42, life)
      const disp = smoothstep(0.68, 1, life)
      const zone = vec2(ZONES.at(s))
      const fx = zone.x + (hash1(seed + 2) - 0.5) * 0.08
      const fy = zone.y + (hash1(seed + 4) - 0.5) * 0.08
      const radius = min(105 + 55 * hash1(seed + 3), size.y * 0.17)
      // Keep the whole rose, scatter included, above the prompt box and bar.
      const floorY = composer.w * size.y + radius * 1.25 + 24
      const center = vec2(fx * size.x, max(fy * size.y, floorY))
      const q = vec2((cellPt - center) / radius)
      // Coming apart: cells drift outward and up, then thin out.
      const jit = vec2(hash2(vec2(p.cell + seed)) - 0.5, hash2(vec2(p.cell + seed + 5.3)) - 0.5)
      const q2 = vec2(q / (1 + 0.9 * disp) - jit * disp * 0.7 - vec2(0, disp * 0.3))
      const f = rose(q2, open, seed, floor(hash1(seed + 6) * 8))
      const keep = hash2(vec2(p.cell * 1.7 + seed)) < 1 - disp * 0.92 ? 1 : 0
      const fade = smoothstep(0, 0.06, life) * (1 - disp * 0.55)
      if (f.a * keep > 0.5) {
        best = vec3(f.rgb * fade)
        covered = 1
      }
    }
  }
  const lum = clamp(pow(max(max(best.r, best.g), best.b) * 1.15, 0.85), 0, 1)
  const idx = max(clamp(floor(lum * 9.99), 0, 9), covered)
  // Brightness walks the palette: prussian, dusk, lavender grey, alabaster.
  const c1 = mix(PRUSSIAN, DUSK, clamp(lum / 0.3, 0, 1))
  const c2 = mix(c1, LAVENDER, clamp((lum - 0.3) / 0.35, 0, 1))
  const tint = vec3(mix(c2, ALABASTER, clamp((lum - 0.65) / 0.35, 0, 1)))
  return vec4(tint, idx / 9)
})

// Pass 2: draw each cell's glyph, on ink black.
const look = picture(p => {
  const cell = floor(p.point / vec2(CW, CH))
  const v = field.at(cell)
  const idx = floor(v.a * 9 + 0.5)
  const local = vec2(p.point - cell * vec2(CW, CH))
  const gx = floor(local.x)
  const gy = 8 - floor(local.y)
  const inside = gx < 7 && gy >= 0 && gy < 8 ? 1 : 0
  const pair = GLYPHS.at(idx)
  const half = gy < 4 ? pair[0] : pair[1]
  const shift = int(clamp((gy % 4) * 7 + gx, 0, 27))
  const bit = signed((half >> shift) & 1)
  const on = bit * inside
  const glow = idx > 0 ? 0.08 : 0
  const rgb = vec3(mix(INK, v.rgb, min(on + glow, 1)))
  return vec4(rgb, 1)
})

export default shader({ fps: 30, passes: [field, look] })
