// Font app: fixture glyphs with corrected directions; select, drag, reshape and undo points.
import {
  apply,
  invert,
  segmentsBounds,
  sub,
  toCubic,
  vec2,
  type Affine,
  type Vec2,
} from '@vcore/geometry';
import {
  constrainDelta,
  diffPaths,
  emptyHistory,
  hitTestPoint,
  movePoints,
  record,
  redo,
  resetHandles,
  retractHandle,
  undo,
  type History,
  type Selection,
} from '@vcore/editing';
import {
  contourArea,
  contourFromSegments,
  correctDirections,
  counterIds,
  detectSmoothPoints,
  drawPath,
  fromSvgPath,
  isClosed,
  isOnCurve,
  toSegments,
  transformPath,
  type Contour,
  type IdGenerator,
  type Path,
  type Point,
} from '@vcore/path';
import fixture from '../../../../fixtures/source-serif-4.json';

/** Hover and click distance, in screen pixels. */
const HIT_RADIUS = 6;
/** Flattening tolerance for the direction check, in font units. */
const DIRECTION_TOLERANCE = 0.5;
/** Largest bend (radians, about 0.6 degrees) at which an anchor still counts as smooth. */
const SMOOTH_ANGLE = 0.01;

const canvas = document.querySelector<HTMLCanvasElement>('#canvas');
const info = document.querySelector<HTMLElement>('#info');
const nav = document.querySelector<HTMLElement>('#glyphs');
const ctx = canvas?.getContext('2d');
if (!canvas || !info || !nav || !ctx) throw new Error('page is missing an element');

interface Glyph {
  readonly name: string;
  readonly advance: number;
  /** As loaded, before direction correction; only used to report what changed. */
  readonly original: Path;
}

const loadGlyph = (name: string): { glyph: Glyph; path: Path; ids: IdGenerator } => {
  const data = fixture.glyphs[name as keyof typeof fixture.glyphs];
  const ids = counterIds(`${name}-`);
  const original = fromSvgPath(data.d, ids);
  // The fixture font is TrueType (quadratic curves). The editor works in cubics, as CFF fonts
  // do, so convert each quadratic to the exact same curve as a cubic.
  const cubics: Path = {
    contours: original.contours.map((c) =>
      contourFromSegments(
        toSegments(c).map((s) => (s.kind === 'quad' ? toCubic(s) : s)),
        isClosed(c),
        ids,
      ),
    ),
  };
  // Outer contours counter-clockwise, as CFF (OpenType) fonts expect.
  const corrected = correctDirections(cubics, 'counterclockwise', DIRECTION_TOLERANCE);
  // SVG path data has no smooth flags; mark anchors that sit in line with their neighbours.
  const path = detectSmoothPoints(corrected, SMOOTH_ANGLE);
  return { glyph: { name, advance: data.advance, original }, path, ids };
};

/** `ids` makes the IDs for points that edits add; one generator per loaded glyph. */
let { glyph, path, ids } = loadGlyph('a');
let history: History = emptyHistory;
let selection: Selection = new Set();
let hoveredId: string | null = null;
/** While dragging: the path and mouse position (model units) when the drag started. */
let drag: { startPath: Path; startAt: Vec2 } | null = null;
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
  drawPath(transformPath(path, view), outline);
  ctx.fillStyle = '#e8e8e8';
  ctx.fill(outline, 'nonzero');
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 1;
  ctx.stroke(outline);

  // Handles, then points: on-curve squares (circles when smooth), off-curve small circles.
  ctx.strokeStyle = '#999';
  for (const c of path.contours) {
    for (const [p, q] of handleLines(c)) {
      const a = screen(p);
      const b = screen(q);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
  for (const c of path.contours) {
    c.points.forEach((p, i) => {
      const s = screen(p);
      const isSelected = selection.has(p.id);
      const active = isSelected || p.id === hoveredId;
      ctx.fillStyle = isSelected ? '#d33' : i === 0 ? '#2a7' : isOnCurve(p) ? '#226' : '#fff';
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
  const bounds = segmentsBounds(path.contours.flatMap(toSegments));
  const rows = path.contours.map((c, i) => {
    const before = glyph.original.contours.at(i);
    const was = before ? direction(before) : '';
    const now = direction(c);
    const change = was === now ? 'unchanged' : `was ${was}`;
    return `<p>Contour ${i + 1}: ${c.points.length} points, ${now} (${change})</p>`;
  });
  const chosen = path.contours.flatMap((c) => c.points).filter((p) => selection.has(p.id));
  const only = chosen.length === 1 ? chosen[0] : undefined;
  const point = only
    ? `<p>${only.id}: ${only.type}${only.smooth ? ', smooth' : ''}</p><p>x ${only.x}, y ${only.y}</p>`
    : chosen.length > 1
      ? `<p>${chosen.length} points selected</p>`
      : '<p>Click a point to select it, shift-click to add. Drag to move (shift: straight).</p>' +
        '<p>Option/Alt-click an anchor to reset its handles, or a handle to retract it.</p>';
  info.innerHTML = `
    <h2>Glyph "${glyph.name}"</h2>
    <p>Advance width ${glyph.advance}</p>
    <p>Bounds x ${bounds.minX} to ${bounds.maxX}, y ${bounds.minY} to ${bounds.maxY}</p>
    <h2 style="margin-top:12px">Contours</h2>${rows.join('')}
    <p style="color:#666">Green point: contour start. Outer contours should be counter-clockwise, holes clockwise.</p>
    <h2 style="margin-top:12px">Selection</h2>${point}
    <p style="color:#666">Undo: Cmd/Ctrl+Z. Redo: Shift+Cmd/Ctrl+Z.</p>`;
};

const mouse = (event: MouseEvent): Vec2 => vec2(event.offsetX, event.offsetY);
const pointUnder = (event: MouseEvent): Point | null =>
  hitTestPoint(path, mouse(event), view, HIT_RADIUS);
/** Screen position to font units. */
const toModel = (at: Vec2): Vec2 => apply(invert(view) ?? view, at);

const render = (): void => {
  fitView();
  draw();
  showInfo();
};

canvas.addEventListener('mousedown', (event) => {
  const hit = pointUnder(event);
  if (event.altKey) {
    if (!hit) return;
    const before = path;
    path = isOnCurve(hit) ? resetHandles(path, hit.id, ids) : retractHandle(path, hit.id);
    history = record(history, diffPaths(before, path));
    // A retracted handle may have been removed (its segment became a line).
    const stillThere = path.contours.some((c) => c.points.some((p) => p.id === hit.id));
    selection = new Set(stillThere ? [hit.id] : []);
    draw();
    showInfo();
    return;
  }
  if (event.shiftKey) {
    if (hit) {
      const next = new Set(selection);
      if (next.has(hit.id)) next.delete(hit.id);
      else next.add(hit.id);
      selection = next;
    }
  } else if (!hit) {
    selection = new Set();
  } else if (!selection.has(hit.id)) {
    selection = new Set([hit.id]);
  }
  if (hit && selection.has(hit.id)) drag = { startPath: path, startAt: toModel(mouse(event)) };
  draw();
  showInfo();
});

canvas.addEventListener('mousemove', (event) => {
  if (drag) {
    const delta = sub(toModel(mouse(event)), drag.startAt);
    path = movePoints(drag.startPath, selection, event.shiftKey ? constrainDelta(delta) : delta);
    draw();
    showInfo();
    return;
  }
  const next = pointUnder(event)?.id ?? null;
  if (next !== hoveredId) {
    hoveredId = next;
    canvas.style.cursor = next ? 'pointer' : 'default';
    draw();
  }
});

window.addEventListener('mouseup', () => {
  if (!drag) return;
  // The whole drag is one undo step.
  history = record(history, diffPaths(drag.startPath, path));
  drag = null;
});

window.addEventListener('keydown', (event) => {
  if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z' || drag) return;
  event.preventDefault();
  const result = event.shiftKey ? redo(history, path) : undo(history, path);
  if (!result) return;
  ({ history, path } = result);
  draw();
  showInfo();
});

window.addEventListener('resize', render);

for (const name of Object.keys(fixture.glyphs)) {
  const button = document.createElement('button');
  button.textContent = name;
  button.setAttribute('aria-pressed', String(name === glyph.name));
  button.addEventListener('click', () => {
    ({ glyph, path, ids } = loadGlyph(name));
    history = emptyHistory;
    selection = new Set();
    hoveredId = null;
    for (const b of nav.querySelectorAll('button')) {
      b.setAttribute('aria-pressed', String(b === button));
    }
    render();
  });
  nav.append(button);
}

render();
