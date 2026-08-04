/**
 * generate-icons.ts — regenerate the GuardianCheck favicon/app-icon package into public/.
 *
 *   npx tsx scripts/generate-icons.ts
 *
 * Run this only when the brand mark or colours change; the emitted PNG/ICO files are
 * committed, so a normal build never needs it. Deliberately dependency-free — it
 * rasterises the mark and encodes PNG with node's built-in zlib, because the project has
 * no image toolchain (no sharp, no ImageMagick) and this shouldn't add one for an
 * occasional design task.
 *
 * The mark is lucide's `shield-check` (the same icon the app UI uses) filled white on a
 * brand-blue tile.
 */

import zlib from "zlib";
import fs from "fs";
import path from "path";

// ---------------------------------------------------------------- brand

const BRAND = { r: 0x25, g: 0x63, b: 0xeb }; // #2563eb — --color-primary in src/index.css
const WHITE = { r: 0xff, g: 0xff, b: 0xff };

/** lucide-react v0.546 `shield-check`, 24x24 viewBox. */
const SHIELD_PATH =
  "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z";
const CHECK_POINTS: Point[] = [
  { x: 9, y: 12 },
  { x: 11, y: 14 },
  { x: 15, y: 10 },
];

type Point = { x: number; y: number };
type RGB = { r: number; g: number; b: number };

// ---------------------------------------------------------------- svg path -> polygons

/**
 * Flattens an SVG path into closed polylines. Supports the subset lucide emits:
 * M/m L/l H/h V/v C/c S/s Q/q T/t A/a Z/z.
 */
function flattenPath(d: string, steps = 24): Point[][] {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const contours: Point[][] = [];
  let current: Point[] = [];
  let cur: Point = { x: 0, y: 0 };
  let start: Point = { x: 0, y: 0 };
  let prevCtrl: Point | null = null;
  let cmd = "";
  let i = 0;

  const num = () => parseFloat(tokens[i++]);
  const push = (p: Point) => current.push(p);

  const bezier = (p0: Point, p1: Point, p2: Point, p3: Point) => {
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const u = 1 - t;
      push({
        x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
        y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
      });
    }
  };

  /** Endpoint-parameterised arc -> cubic beziers (SVG spec F.6.5). */
  const arc = (p0: Point, rx: number, ry: number, rot: number, large: number, sweep: number, p1: Point) => {
    if (rx === 0 || ry === 0) return push(p1);
    rx = Math.abs(rx);
    ry = Math.abs(ry);
    const phi = (rot * Math.PI) / 180;
    const cosP = Math.cos(phi);
    const sinP = Math.sin(phi);
    const dx2 = (p0.x - p1.x) / 2;
    const dy2 = (p0.y - p1.y) / 2;
    const x1 = cosP * dx2 + sinP * dy2;
    const y1 = -sinP * dx2 + cosP * dy2;

    // Scale radii up if they can't span the endpoints.
    const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
    if (lambda > 1) {
      const s = Math.sqrt(lambda);
      rx *= s;
      ry *= s;
    }

    const sign = large === sweep ? -1 : 1;
    const numer = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
    const denom = rx * rx * y1 * y1 + ry * ry * x1 * x1;
    const co = sign * Math.sqrt(Math.max(0, numer / denom));
    const cx1 = (co * rx * y1) / ry;
    const cy1 = (-co * ry * x1) / rx;
    const cx = cosP * cx1 - sinP * cy1 + (p0.x + p1.x) / 2;
    const cy = sinP * cx1 + cosP * cy1 + (p0.y + p1.y) / 2;

    const angle = (ux: number, uy: number, vx: number, vy: number) => {
      const dot = ux * vx + uy * vy;
      const len = Math.sqrt(ux * ux + uy * uy) * Math.sqrt(vx * vx + vy * vy);
      const a = Math.acos(Math.min(1, Math.max(-1, dot / len)));
      return ux * vy - uy * vx < 0 ? -a : a;
    };

    const theta = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
    let delta = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
    if (!sweep && delta > 0) delta -= 2 * Math.PI;
    if (sweep && delta < 0) delta += 2 * Math.PI;

    const n = Math.max(2, Math.ceil(Math.abs(delta) / (Math.PI / 8)));
    for (let s = 1; s <= n; s++) {
      const t = theta + (delta * s) / n;
      push({
        x: cosP * rx * Math.cos(t) - sinP * ry * Math.sin(t) + cx,
        y: sinP * rx * Math.cos(t) + cosP * ry * Math.sin(t) + cy,
      });
    }
  };

  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? cur.x : 0;
    const oy = rel ? cur.y : 0;

    switch (cmd.toLowerCase()) {
      case "m": {
        if (current.length > 1) contours.push(current);
        cur = { x: num() + ox, y: num() + oy };
        start = { ...cur };
        current = [{ ...cur }];
        cmd = rel ? "l" : "L"; // subsequent pairs are implicit lineto
        prevCtrl = null;
        break;
      }
      case "l": {
        cur = { x: num() + ox, y: num() + oy };
        push({ ...cur });
        prevCtrl = null;
        break;
      }
      case "h": {
        cur = { x: num() + ox, y: cur.y };
        push({ ...cur });
        prevCtrl = null;
        break;
      }
      case "v": {
        cur = { x: cur.x, y: num() + oy };
        push({ ...cur });
        prevCtrl = null;
        break;
      }
      case "c": {
        const c1 = { x: num() + ox, y: num() + oy };
        const c2 = { x: num() + ox, y: num() + oy };
        const end = { x: num() + ox, y: num() + oy };
        bezier(cur, c1, c2, end);
        prevCtrl = c2;
        cur = end;
        break;
      }
      case "s": {
        const c1 = prevCtrl ? { x: 2 * cur.x - prevCtrl.x, y: 2 * cur.y - prevCtrl.y } : { ...cur };
        const c2 = { x: num() + ox, y: num() + oy };
        const end = { x: num() + ox, y: num() + oy };
        bezier(cur, c1, c2, end);
        prevCtrl = c2;
        cur = end;
        break;
      }
      case "q": {
        const q = { x: num() + ox, y: num() + oy };
        const end = { x: num() + ox, y: num() + oy };
        bezier(
          cur,
          { x: cur.x + (2 / 3) * (q.x - cur.x), y: cur.y + (2 / 3) * (q.y - cur.y) },
          { x: end.x + (2 / 3) * (q.x - end.x), y: end.y + (2 / 3) * (q.y - end.y) },
          end
        );
        prevCtrl = q;
        cur = end;
        break;
      }
      case "a": {
        const rx = num();
        const ry = num();
        const rot = num();
        const large = num();
        const sweep = num();
        const end = { x: num() + ox, y: num() + oy };
        arc(cur, rx, ry, rot, large, sweep, end);
        cur = end;
        prevCtrl = null;
        break;
      }
      case "z": {
        if (current.length > 1) contours.push(current);
        current = [];
        cur = { ...start };
        prevCtrl = null;
        break;
      }
      default:
        i++; // unknown command, skip
    }
  }
  if (current.length > 1) contours.push(current);
  return contours;
}

// ---------------------------------------------------------------- raster canvas

class Canvas {
  w: number;
  h: number;
  /** RGBA, premultiplied-free straight alpha. */
  px: Float64Array;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.px = new Float64Array(w * h * 4);
  }

  blend(x: number, y: number, c: RGB, a: number) {
    if (a <= 0 || x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    const dstA = this.px[i + 3];
    const outA = a + dstA * (1 - a);
    if (outA <= 0) return;
    this.px[i] = (c.r * a + this.px[i] * dstA * (1 - a)) / outA;
    this.px[i + 1] = (c.g * a + this.px[i + 1] * dstA * (1 - a)) / outA;
    this.px[i + 2] = (c.b * a + this.px[i + 2] * dstA * (1 - a)) / outA;
    this.px[i + 3] = outA;
  }

  /** Scanline fill with nonzero winding, `ss` samples per axis. */
  fill(contours: Point[][], color: RGB, ss = 4) {
    const edges: { x0: number; y0: number; x1: number; y1: number }[] = [];
    for (const c of contours) {
      for (let k = 0; k < c.length; k++) {
        const a = c[k];
        const b = c[(k + 1) % c.length];
        if (a.y !== b.y) edges.push({ x0: a.x, y0: a.y, x1: b.x, y1: b.y });
      }
    }
    if (!edges.length) return;

    const cov = new Float64Array(this.w * this.h);
    const inc = 1 / (ss * ss);

    for (let sy = 0; sy < this.h * ss; sy++) {
      const y = (sy + 0.5) / ss;
      const hits: { x: number; dir: number }[] = [];
      for (const e of edges) {
        const [lo, hi] = e.y0 < e.y1 ? [e.y0, e.y1] : [e.y1, e.y0];
        if (y < lo || y >= hi) continue;
        hits.push({
          x: e.x0 + ((y - e.y0) / (e.y1 - e.y0)) * (e.x1 - e.x0),
          dir: e.y1 > e.y0 ? 1 : -1,
        });
      }
      if (hits.length < 2) continue;
      hits.sort((a, b) => a.x - b.x);

      let winding = 0;
      for (let k = 0; k < hits.length - 1; k++) {
        winding += hits[k].dir;
        if (winding === 0) continue;
        const xStart = Math.ceil(hits[k].x * ss - 0.5);
        const xEnd = Math.ceil(hits[k + 1].x * ss - 0.5);
        const row = Math.floor(sy / ss) * this.w;
        for (let sx = Math.max(0, xStart); sx < Math.min(this.w * ss, xEnd); sx++) {
          cov[row + Math.floor(sx / ss)] += inc;
        }
      }
    }

    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const a = Math.min(1, cov[y * this.w + x]);
        if (a > 0) this.blend(x, y, color, a);
      }
    }
  }

  /** Round-capped, round-joined polyline stroke via distance field. */
  stroke(points: Point[], width: number, color: RGB) {
    const r = width / 2;
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const x0 = Math.max(0, Math.floor(Math.min(...xs) - r - 2));
    const x1 = Math.min(this.w, Math.ceil(Math.max(...xs) + r + 2));
    const y0 = Math.max(0, Math.floor(Math.min(...ys) - r - 2));
    const y1 = Math.min(this.h, Math.ceil(Math.max(...ys) + r + 2));

    const distToSeg = (px: number, py: number, a: Point, b: Point) => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / len2));
      return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
    };

    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        let d = Infinity;
        for (let k = 0; k < points.length - 1; k++) {
          d = Math.min(d, distToSeg(x + 0.5, y + 0.5, points[k], points[k + 1]));
        }
        // 1px linear falloff at the edge for anti-aliasing.
        const a = Math.max(0, Math.min(1, r - d + 0.5));
        if (a > 0) this.blend(x, y, color, a);
      }
    }
  }

  toRGBA8(): Buffer {
    const out = Buffer.alloc(this.w * this.h * 4);
    for (let i = 0; i < this.w * this.h * 4; i++) {
      out[i] = Math.max(0, Math.min(255, Math.round(this.px[i] * (i % 4 === 3 ? 255 : 1))));
    }
    return out;
  }
}

// ---------------------------------------------------------------- png encoding

function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(rgba: Buffer, w: number, h: number): Buffer {
  // One filter byte (0 = None) per scanline.
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** ICO with PNG-compressed entries (universally supported since Vista / all modern browsers). */
function encodeICO(images: { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + images.length * 16;
  const dir: Buffer[] = [];
  for (const img of images) {
    const e = Buffer.alloc(16);
    e[0] = img.size >= 256 ? 0 : img.size;
    e[1] = img.size >= 256 ? 0 : img.size;
    e[2] = 0; // palette
    e[3] = 0;
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bpp
    e.writeUInt32BE(0, 8);
    e.writeUInt32LE(img.png.length, 8);
    e.writeUInt32LE(offset, 12);
    dir.push(e);
    offset += img.png.length;
  }
  return Buffer.concat([header, ...dir, ...images.map((i) => i.png)]);
}

// ---------------------------------------------------------------- composition

/** Rounded-rect contour, clockwise. */
function roundedRect(x: number, y: number, w: number, h: number, r: number): Point[] {
  const pts: Point[] = [];
  const corner = (cx: number, cy: number, from: number, to: number) => {
    for (let s = 0; s <= 10; s++) {
      const a = from + ((to - from) * s) / 10;
      pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
  };
  corner(x + w - r, y + r, -Math.PI / 2, 0);
  corner(x + w - r, y + h - r, 0, Math.PI / 2);
  corner(x + r, y + h - r, Math.PI / 2, Math.PI);
  corner(x + r, y + r, Math.PI, (3 * Math.PI) / 2);
  return pts;
}

function transform(contours: Point[][], scale: number, dx: number, dy: number): Point[][] {
  return contours.map((c) => c.map((p) => ({ x: p.x * scale + dx, y: p.y * scale + dy })));
}

type IconOptions = {
  /** Full-bleed square background instead of a rounded tile (Android maskable). */
  maskable?: boolean;
  /** Transparent background — used for nothing currently, kept for the favicon experiment. */
  transparent?: boolean;
};

function renderIcon(size: number, opts: IconOptions = {}): Buffer {
  const ss = size <= 64 ? 8 : 4;
  const canvas = new Canvas(size, size);

  // Background tile.
  if (!opts.transparent) {
    const radius = opts.maskable ? 0 : size * 0.2237; // iOS-ish squircle radius
    canvas.fill([roundedRect(0, 0, size, size, radius)], BRAND, ss);
  }

  // Mark. Maskable icons must sit inside the 80%-diameter safe zone, so the mark is
  // smaller there than on the standard tile.
  const markFraction = opts.maskable ? 0.5 : 0.66;
  const scale = (size * markFraction) / 24;
  const offset = (size - 24 * scale) / 2;

  canvas.fill(transform(flattenPath(SHIELD_PATH), scale, offset, offset), WHITE, ss);
  canvas.stroke(
    CHECK_POINTS.map((p) => ({ x: p.x * scale + offset, y: p.y * scale + offset })),
    Math.max(1.5, 2.1 * scale),
    BRAND
  );

  return encodePNG(canvas.toRGBA8(), size, size);
}

/**
 * Vector twin of {@link renderIcon}. Modern browsers prefer this over the PNGs and it
 * stays sharp on any display, so it is generated from the same constants rather than
 * hand-written — a hand-written copy is what drifts when the brand colour changes.
 */
function renderSVG(): string {
  const hex = (c: RGB) => `#${[c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  const mark = 0.66;
  const scale = (64 * mark) / 24;
  const offset = (64 - 24 * scale) / 2;
  const t = `translate(${offset.toFixed(3)} ${offset.toFixed(3)}) scale(${scale.toFixed(5)})`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="GuardianCheck">
  <rect width="64" height="64" rx="14.32" fill="${hex(BRAND)}"/>
  <g transform="${t}">
    <path d="${SHIELD_PATH}" fill="${hex(WHITE)}"/>
    <path d="M9 12l2 2 4-4" fill="none" stroke="${hex(BRAND)}" stroke-width="2.1"
          stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>
`;
}

// ---------------------------------------------------------------- main

const publicDir = path.join(process.cwd(), "public");
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

const outputs: { file: string; png: Buffer }[] = [
  { file: "favicon-16x16.png", png: renderIcon(16) },
  { file: "favicon-32x32.png", png: renderIcon(32) },
  { file: "favicon-48x48.png", png: renderIcon(48) },
  { file: "apple-touch-icon.png", png: renderIcon(180) },
  { file: "icon-192.png", png: renderIcon(192) },
  { file: "icon-512.png", png: renderIcon(512) },
  { file: "icon-maskable-512.png", png: renderIcon(512, { maskable: true }) },
];

for (const o of outputs) {
  fs.writeFileSync(path.join(publicDir, o.file), o.png);
  console.log(`  public/${o.file.padEnd(26)} ${String(o.png.length).padStart(7)} bytes`);
}

const ico = encodeICO([
  { size: 16, png: renderIcon(16) },
  { size: 32, png: renderIcon(32) },
  { size: 48, png: renderIcon(48) },
]);
fs.writeFileSync(path.join(publicDir, "favicon.ico"), ico);
console.log(`  public/${"favicon.ico".padEnd(26)} ${String(ico.length).padStart(7)} bytes`);

const svg = renderSVG();
fs.writeFileSync(path.join(publicDir, "icon.svg"), svg, "utf8");
console.log(`  public/${"icon.svg".padEnd(26)} ${String(Buffer.byteLength(svg)).padStart(7)} bytes`);

console.log("\nIcons regenerated.");
