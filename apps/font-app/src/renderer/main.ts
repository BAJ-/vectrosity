import { apply, distance, segmentsBounds, vec2, type Affine, type Vec2 } from '@vcore/geometry';
import {
  contourArea,
  correctDirections,
  counterIds,
  drawPath,
  fromSvgPath,
  isOnCurve,
  toSegments,
  transformPath,
  type Contour,
  type Path,
  type Point,
} from '@vcore/path';
import fixture from '../../../../fixtures/source-serif-4.json';

/** Hover and click distance, in screen pixels. */
const HIT_RADIUS = 6;
/** Flattening tolerance for the direction check, in font units. */
const DIRECTION_TOLERANCE = 0.5;

const canvas = document.querySelector<HTMLCanvasElement>('#canvas');
const info = document.querySelector<HTMLElement>('#info');
const nav = document.querySelector<HTMLElement>('#glyphs');
const ctx = canvas?.getContext('2d');
if (!canvas || !info || !nav || !ctx) throw new Error('page is missing an element');

interface GlyphView {
  readonly name: string;
  readonly advance: number;
  readonly original: Path;
  /** Outer contours counter-clockwise, as CFF (OpenType) fonts expect. */
  readonly path: Path;
}

const loadGlyph = (name: string): GlyphView => {
  const glyph = fixture.glyphs[name as keyof typeof fixture.glyphs];
  const original = fromSvgPath(glyph.d, counterIds(`${name}-`));
  const path = correctDirections(original, 'counterclockwise', DIRECTION_TOLERANCE);
  return { name, advance: glyph.advance, original, path };
};

let glyph = loadGlyph('a');
let hovered: Point | null = null;
let selected: Point | null = null;
/** Font units to screen pixels (y flipped: fonts are y-up, the screen is y-down). */
let view: Affine = [1, 0, 0, 1, 0, 0];

const fitView = (): void => {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  // Fit the em box (descender to ascender) and the advance width, with a margin.
  const top = fixture.ascender;
  const bottom = fixture.descender;
  const scale = Math.min((height * 0.8) / (top - bottom), (width * 0.8) / glyph.advance);
  const left = (width - glyph.advance * scale) / 2;
  view = [scale, 0, 0, -scale, left, height / 2 + ((top + bottom) / 2) * scale];
};

const screen = (p: Vec2): Vec2 => apply(view, p);

/** Pairs of points joined by a handle line: every off-curve point to its neighbours,
 *  except the two handles of a cubic, which are not joined to each other. */
const handleLines = (c: Contour): [Point, Point][] => {
  const pts = c.points;
  const lines: [Point, Point][] = [];
  pts.forEach((p, i) => {
    const q = pts.at((i + 1) % pts.length);
    if (!q || (isOnCurve(p) && isOnCurve(q))) return;
    if (!isOnCurve(p) && !isOnCurve(q)) {
      const nextOn = pts
        .slice(i + 1)
        .concat(pts)
        .find(isOnCurve);
      if (nextOn?.type === 'curve') return;
    }
    lines.push([p, q]);
  });
  return lines;
};

const draw = (): void => {
  const dpr = window.devicePixelRatio;
  canvas.width = canvas.clientWidth * dpr;
  canvas.height = canvas.clientHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

  // Metric lines: baseline, ascender, descender, advance width.
  ctx.strokeStyle = '#ccc';
  ctx.lineWidth = 1;
  for (const y of [0, fixture.ascender, fixture.descender]) {
    const a = screen(vec2(0, y));
    const b = screen(vec2(glyph.advance, y));
    ctx.beginPath();
    ctx.moveTo(0, a.y);
    ctx.lineTo(canvas.clientWidth, b.y);
    ctx.stroke();
  }
  for (const x of [0, glyph.advance]) {
    const a = screen(vec2(x, fixture.descender));
    const b = screen(vec2(x, fixture.ascender));
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  // The outline in screen space: filled with the non-zero rule, then stroked.
  const outline = new Path2D();
  drawPath(transformPath(glyph.path, view), outline);
  ctx.fillStyle = '#e8e8e8';
  ctx.fill(outline, 'nonzero');
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 1;
  ctx.stroke(outline);

  // Handles, then points: on-curve squares (circles when smooth), off-curve small circles.
  ctx.strokeStyle = '#999';
  for (const c of glyph.path.contours) {
    for (const [p, q] of handleLines(c)) {
      const a = screen(p);
      const b = screen(q);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
  for (const c of glyph.path.contours) {
    c.points.forEach((p, i) => {
      const s = screen(p);
      const active = p === selected || p === hovered;
      ctx.fillStyle = p === selected ? '#d33' : i === 0 ? '#2a7' : isOnCurve(p) ? '#226' : '#fff';
      ctx.strokeStyle = active ? '#d33' : '#226';
      const r = active ? 5 : 3.5;
      ctx.beginPath();
      if (isOnCurve(p) && !p.smooth) ctx.rect(s.x - r, s.y - r, r * 2, r * 2);
      else ctx.arc(s.x, s.y, isOnCurve(p) ? r : r - 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }
};

const direction = (c: Contour): string =>
  contourArea(c) > 0 ? 'counter-clockwise' : contourArea(c) < 0 ? 'clockwise' : 'no area';

const showInfo = (): void => {
  const bounds = segmentsBounds(glyph.path.contours.flatMap(toSegments));
  const rows = glyph.path.contours.map((c, i) => {
    const before = glyph.original.contours.at(i);
    const was = before ? direction(before) : '';
    const now = direction(c);
    const change = was === now ? 'unchanged' : `was ${was}`;
    return `<p>Contour ${i + 1}: ${c.points.length} points, ${now} (${change})</p>`;
  });
  const point = selected
    ? `<p>${selected.id}: ${selected.type}${selected.smooth ? ', smooth' : ''}</p><p>x ${selected.x}, y ${selected.y}</p>`
    : '<p>Click a point to select it.</p>';
  info.innerHTML = `
    <h2>Glyph "${glyph.name}"</h2>
    <p>Advance width ${glyph.advance}</p>
    <p>Bounds x ${bounds.minX} to ${bounds.maxX}, y ${bounds.minY} to ${bounds.maxY}</p>
    <h2 style="margin-top:12px">Contours</h2>${rows.join('')}
    <p style="color:#666">Green point: contour start. Outer contours should be counter-clockwise, holes clockwise.</p>
    <h2 style="margin-top:12px">Selection</h2>${point}`;
};

const pointAtScreen = (at: Vec2): Point | null => {
  let best: Point | null = null;
  let bestDistance = HIT_RADIUS;
  for (const c of glyph.path.contours) {
    for (const p of c.points) {
      const d = distance(screen(p), at);
      if (d <= bestDistance) {
        best = p;
        bestDistance = d;
      }
    }
  }
  return best;
};

const render = (): void => {
  fitView();
  draw();
  showInfo();
};

canvas.addEventListener('mousemove', (event) => {
  const next = pointAtScreen(vec2(event.offsetX, event.offsetY));
  if (next !== hovered) {
    hovered = next;
    canvas.style.cursor = next ? 'pointer' : 'default';
    draw();
  }
});
canvas.addEventListener('mousedown', (event) => {
  selected = pointAtScreen(vec2(event.offsetX, event.offsetY));
  draw();
  showInfo();
});
window.addEventListener('resize', render);

for (const name of Object.keys(fixture.glyphs)) {
  const button = document.createElement('button');
  button.textContent = name;
  button.setAttribute('aria-pressed', String(name === glyph.name));
  button.addEventListener('click', () => {
    glyph = loadGlyph(name);
    hovered = null;
    selected = null;
    for (const b of nav.querySelectorAll('button')) {
      b.setAttribute('aria-pressed', String(b === button));
    }
    render();
  });
  nav.append(button);
}

render();
