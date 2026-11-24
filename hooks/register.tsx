import type { Register, ThemeSetArgs } from 'claude-code'

import { makeColors } from './make-colors.js'

// ---------------------------------------------------------------------------
// Colors: pitch black surfaces, neon roles.
// ---------------------------------------------------------------------------

const { theme, problems } = makeColors({
  label: 'ASCII Bloom',
  only: 'dark',
  roles: { accent: '#778da9', danger: '#c96a72', success: '#7fa88a', warning: '#c9a96a', pro: '#8f86b5' },
  dark: {
    gray: {
      anchors: {
        'surface-0': '#0d1b2a',
        'surface-1': '#132136',
        'surface-2': '#1b263b',
        'surface-3': '#1e2a40',
        'text-primary': '#e0e1dd',
        'text-secondary': '#b9c1cc',
        'text-muted': '#8b9db5',
      },
    },
  },
})

// ---------------------------------------------------------------------------
// Dense, shaded ASCII roses. Each flower is a field of layered petals
// rendered onto a character grid: denser glyphs read as brighter.
// ---------------------------------------------------------------------------

const RAMP = ' .:-=+*#%@'
const ASPECT = 0.6 // a monospace glyph is about 0.6 of its line height wide

type Cell = { ch: string; tone: 0 | 1 | 2 } // 0 petal, 1 highlight, 2 center
type Grid = Cell[][]

const BLANK: Cell = { ch: ' ', tone: 0 }

type Rose = { petals: number[]; phases: number[]; open: number[]; light: number; seed: number }

// Deterministic per-cell noise so a frame is stable.
function hash(a: number, b: number, c: number): number {
  const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453
  return s - Math.floor(s)
}

function makeRose(): Rose {
  const layers = 4 + Math.floor(Math.random() * 2)
  const petals: number[] = []
  const phases: number[] = []
  const open: number[] = []
  const base = Math.random() * Math.PI * 2
  for (let l = 0; l < layers; l++) {
    petals.push(Math.max(3, 6 - l + Math.floor(Math.random() * 2)))
    phases.push(base + l * 0.9 + Math.random() * 0.4)
    open.push(1 - (l / layers) * 0.82)
  }
  return { petals, phases, open, light: 2.2 + Math.random() * 0.6, seed: Math.random() * 1000 }
}

// The radius of layer `l` at angle `a`, for openness `p` (0 bud .. 1 open).
function layerRadius(rose: Rose, l: number, a: number, p: number, R: number): number {
  const n = rose.petals[l]!
  const lobeDepth = 0.08 + 0.3 * p
  const lobe = Math.abs(Math.cos((n * a) / 2 + rose.phases[l]!))
  // Outer layers unfold later than inner ones.
  const layers = rose.petals.length
  const lag = (layers - 1 - l) / layers
  const unfold = Math.min(1, Math.max(0, (p - lag * 0.55) / (1 - lag * 0.55)))
  const scale = rose.open[l]! * (0.28 + 0.72 * unfold)
  return R * scale * (1 - lobeDepth + lobeDepth * lobe)
}

function renderRose(rose: Rose, R: number, p: number): Grid {
  const rows = Math.ceil(R) * 2 + 1
  const cols = Math.ceil((rows / ASPECT) | 1)
  const cy = (rows - 1) / 2
  const cx = (cols - 1) / 2
  const layers = rose.petals.length
  const grid: Grid = []
  for (let y = 0; y < rows; y++) {
    const row: Cell[] = []
    for (let x = 0; x < cols; x++) {
      const dx = (x - cx) * ASPECT
      const dy = y - cy
      const r = Math.hypot(dx, dy)
      const a = Math.atan2(dy, dx)
      // Innermost layer containing this point sits on top.
      let layer = -1
      for (let l = layers - 1; l >= 0; l--) {
        if (r < layerRadius(rose, l, a, p, R)) {
          layer = l
          break
        }
      }
      if (layer < 0) {
        row.push(BLANK)
        continue
      }
      const core = R * (0.1 + 0.05 * p)
      if (r < core) {
        row.push({ ch: r < core * 0.55 ? '@' : '%', tone: 2 })
        continue
      }
      const outer = layerRadius(rose, layer, a, p, R)
      const inner = layer < layers - 1 ? layerRadius(rose, layer + 1, a, p, R) : core
      const t = Math.min(1, Math.max(0, (r - inner) / Math.max(0.001, outer - inner)))
      let b = 0.22 + 0.78 * Math.pow(t, 1.25)
      b *= 0.68 + 0.32 * Math.cos(a - rose.light) // light from one side
      if (t < 0.14) b *= 0.45 // shadow tucked under the petal above
      const lobe = Math.abs(Math.cos((rose.petals[layer]! * a) / 2 + rose.phases[layer]!))
      if (lobe < 0.16) b *= 0.55 // crease between petals
      b += (hash(x, y, rose.seed) - 0.5) * 0.14
      const idx = Math.min(RAMP.length - 1, Math.max(1, Math.round(b * (RAMP.length - 1))))
      row.push({ ch: RAMP[idx]!, tone: idx >= 8 ? 1 : 0 })
    }
    grid.push(row)
  }
  return grid
}

// The flower coming apart: glyphs drift outward, thin out and lighten.
function scatter(src: Grid, spread: number, keep: number, salt: number): Grid {
  const rows = src.length
  const cols = src[0]!.length
  const outRows = Math.ceil(rows * spread) | 1
  const outCols = Math.ceil(cols * spread) | 1
  const out: Grid = Array.from({ length: outRows }, () => Array.from({ length: outCols }, () => BLANK))
  const cy = (rows - 1) / 2
  const cx = (cols - 1) / 2
  const oy = (outRows - 1) / 2
  const ox = (outCols - 1) / 2
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const c = src[y]![x]!
      if (c.ch === ' ' || hash(x, y, salt) > keep) continue
      const push = spread * (0.8 + hash(y, x, salt + 1) * 0.5)
      const nx = Math.round(ox + (x - cx) * push + (hash(x, salt, y) - 0.5) * 3)
      const ny = Math.round(oy + (y - cy) * push + (hash(salt, x, y) - 0.5) * 2 - spread)
      if (ny < 0 || ny >= outRows || nx < 0 || nx >= outCols) continue
      const fade = Math.max(1, RAMP.indexOf(c.ch) - Math.round(spread * 3))
      out[ny]![nx] = { ch: RAMP[Math.min(fade, 5)]!, tone: 0 }
    }
  }
  return out
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// One <text> per row; highlight and center runs as classed tspans.
function gridMarkup(g: Grid, x: number, cy: number, lh: number, cls: string, rest: number): string {
  const top = cy - ((g.length - 1) / 2) * lh
  let out = `<g class="${cls}" opacity="${rest}">`
  g.forEach((row, i) => {
    // Trim fully blank rows.
    if (row.every(c => c.ch === ' ')) return
    let line = ''
    let run = ''
    let tone = 0
    const flush = () => {
      if (run === '') return
      line += tone === 0 ? esc(run) : `<tspan class="${tone === 1 ? 'h' : 'c'}">${esc(run)}</tspan>`
      run = ''
    }
    for (const c of row) {
      const t = c.ch === ' ' ? tone : c.tone
      if (t !== tone) {
        flush()
        tone = t
      }
      run += c.ch
    }
    flush()
    out += `<text x="${x}" y="${Math.round(top + i * lh)}">${line}</text>`
  })
  return out + '</g>'
}

// ---------------------------------------------------------------------------
// The scene: spots across the field, each blooming on its own slot of a
// shared cycle, so only a few are open at once and they keep moving around.
// ---------------------------------------------------------------------------

const VW = 1600
const VH = 1000
const PERIOD = 40
const COUNT = 14

const PETALS = ['#778da9', '#e0e1dd', '#415a77', '#9aabc2']
const CENTERS = ['#e0e1dd', '#778da9']

const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]!

function mixWhite(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16)
  const ch = (v: number) => Math.round(v + (255 - v) * amount).toString(16).padStart(2, '0')
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`
}

function placeSpots(): { x: number; y: number }[] {
  const spots: { x: number; y: number }[] = []
  let tries = 0
  while (spots.length < COUNT && tries < 5000) {
    tries++
    const sideways = Math.random() < 0.7
    const x = sideways
      ? Math.random() < 0.5 ? 130 + Math.random() * 330 : 1140 + Math.random() * 330
      : 500 + Math.random() * 600
    const y = sideways ? 170 + Math.random() * 600 : 150 + Math.random() * 280
    if (spots.every(s => Math.hypot(s.x - x, s.y - y) > 240)) {
      spots.push({ x: Math.round(x), y: Math.round(y) })
    }
  }
  return spots
}

function buildScene(): string {
  const spots = placeSpots()
  const order = spots.map((_, i) => i).sort(() => Math.random() - 0.5)
  let groups = ''
  let css = ''

  spots.forEach((s, i) => {
    const slot = order[i]!
    const size = 10 + Math.round(Math.random() * 4)
    const lh = size
    const R = 7 + Math.random() * 3
    const rose = makeRose()
    const petal = pick(PETALS)
    let center = pick(CENTERS)
    if (center === petal) center = '#ffffff'
    const full = renderRose(rose, R, 1)
    const frames: Grid[] = [
      renderRose(rose, R, 0.15),
      renderRose(rose, R, 0.45),
      renderRose(rose, R, 0.72),
      full,
      scatter(full, 1.3, 0.6, rose.seed + 7),
      scatter(full, 1.75, 0.28, rose.seed + 13),
    ]
    // Resting look for reduced motion: a few flowers simply open.
    const restOpen = slot % 4 === 0 ? 1 : 0
    const inner = frames.map((g, k) => gridMarkup(g, s.x, s.y, lh, `k${k}`, k === 3 ? restOpen : 0)).join('')
    groups += `<g class="p${i}" fill="${petal}" font-size="${size}">${inner}</g>`
    const delay = -(((slot + Math.random() * 0.5) / COUNT) * PERIOD)
    css += `.p${i}>g{animation-delay:${delay.toFixed(2)}s}.p${i} .h{fill:${mixWhite(petal, 0.5)}}.p${i} .c{fill:${center}}`
  })

  // Frame windows as % of the cycle: bud, opening, nearly open, open, scatter, scatter.
  const style = `
text{font-family:ui-monospace,Menlo,Consolas,monospace;font-weight:700;text-anchor:middle;white-space:pre}
.k0,.k1,.k2,.k3,.k4,.k5{animation-duration:${PERIOD}s;animation-iteration-count:infinite;animation-timing-function:linear;animation-fill-mode:both}
.k0{animation-name:a0}.k1{animation-name:a1}.k2{animation-name:a2}.k3{animation-name:a3}.k4{animation-name:a4}.k5{animation-name:a5}
@keyframes a0{0%{opacity:0}0.8%{opacity:1}2.6%{opacity:1}3%{opacity:0}100%{opacity:0}}
@keyframes a1{0%,2.6%{opacity:0}3%{opacity:1}5.6%{opacity:1}6%{opacity:0}100%{opacity:0}}
@keyframes a2{0%,5.6%{opacity:0}6%{opacity:1}8.6%{opacity:1}9%{opacity:0}100%{opacity:0}}
@keyframes a3{0%,8.6%{opacity:0}9%{opacity:1}20.6%{opacity:1}21%{opacity:0}100%{opacity:0}}
@keyframes a4{0%,20.6%{opacity:0}21%{opacity:0.9}23.6%{opacity:0.75}24%{opacity:0}100%{opacity:0}}
@keyframes a5{0%,23.6%{opacity:0}24%{opacity:0.6}28%{opacity:0}100%{opacity:0}}
${css}`

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VW} ${VH}" preserveAspectRatio="xMidYMid slice">` +
    `<style>${style}</style>` +
    `<defs><filter id="glow" x="-20%" y="-20%" width="140%" height="140%">` +
    `<feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>` +
    `</filter></defs>` +
    `<rect width="${VW}" height="${VH}" fill="#0d1b2a"/>` +
    `<g filter="url(#glow)" xml:space="preserve">${groups}</g>` +
    `</svg>`
  )
}

const SCENE = buildScene()

// ---------------------------------------------------------------------------
// The look: monospace everywhere, opaque black rows over the garden.
// ---------------------------------------------------------------------------

const BASE: ThemeSetArgs = {
  colors: theme,
  backdrop: { scene: 'ascii-bloom', glass: false },
}

const LOOK: ThemeSetArgs = {
  ...BASE,
  style: {
    Text: { fontFamily: ['mono'], color: '#e0e1dd' },
    Heading: { fontFamily: ['mono'], color: '#e0e1dd' },
    UserMessage: { fontFamily: ['mono'], color: '#e0e1dd', backgroundColor: '#1b263b', radius: 0, padding: 12 },
    AssistantMessage: { fontFamily: ['mono'], color: '#e0e1dd', backgroundColor: '#0d1b2a', radius: 0, padding: 12 },
    ToolUse: { fontFamily: ['mono'], color: '#e0e1dd', backgroundColor: '#132136', radius: 0, paddingX: 8 },
  },
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const unpainted = problems.find(line => line.startsWith("Desktop won't paint"))
    if (unpainted !== undefined) {
      $.ui.toast(unpainted)
    }
    let set
    try {
      set = await $.theme.set(LOOK)
    } catch (error) {
      $.ui.log(String(error))
      set = await $.theme.set(BASE)
    }
    if (!set.isDrawn) {
      $.ui.status(set.reason)
    }
    return next(e)
  })

  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    if (e.surface !== 'desktop' && e.surface !== 'mobile') {
      return next(e)
    }
    const { Shader, Svg } = $.ui.resolve(e)
    return (
      <Shader module="./bloom-shader.ts">
        <Svg source={SCENE} alt="Neon ASCII roses blooming and scattering a few at a time on a black field" isInteractive />
      </Shader>
    )
  })
}
