// Font app: fixture glyphs with corrected directions; select, move, reshape, draw, snap and undo,
// with metric lines and ruler guides that can be dragged.
import {
  add,
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
  diff,
  dragSegment,
  emptyHistory,
  guideSnapTargets,
  hitTestGuide,
  hitTestPoint,
  hitTestSegment,
  idlePen,
  movePoints,
  penAdd,
  penClose,
  penContinue,
  pointsInRect,
  record,
  redo,
  resetHandles,
  retractHandle,
  snapDelta,
  toggleSmooth,
  undo,
  type EditState,
  type Guide,
  type HandleMode,
  type History,
  type PenState,
  type Selection,
  type SnapResult,
} from '@vcore/editing';
import {
  contourArea,
  contourFromSegments,
  contourRuns,
  correctDirections,
  counterIds,
  detectSmoothPoints,
  drawPath,
  fromSvgPath,
  insertPoint,
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
/** How close a dragged or placed point must come to a guide to snap, in screen pixels. */
const SNAP_RADIUS = 6;
/** Flattening tolerance for the direction check, in font units. */
const DIRECTION_TOLERANCE = 0.5;
/** Largest bend (radians, about 0.6 degrees) at which an anchor still counts as smooth. */
const SMOOTH_ANGLE = 0.01;
/** Width of the rulers along the top and left of the canvas, in screen pixels. */
const RULER = 20;
/** Arrow-key nudge, in font units; shift nudges by the larger step. */
const NUDGE = 1;
const NUDGE_LARGE = 10;

const canvas = document.querySelector<HTMLCanvasElement>('#canvas');
const info = document.querySelector<HTMLElement>('#info');
const nav = document.querySelector<HTMLElement>('#glyphs');
const handleSelect = document.querySelector<HTMLSelectElement>('#handle-mode');
const ctx = canvas?.getContext('2d');
if (!canvas || !info || !nav || !handleSelect || !ctx) {
  throw new Error('page is missing an element');
}

/** The Handles setting: what the opposite handle of a smooth anchor does in a drag. */
const handleMode = (): HandleMode => {
  const value = handleSelect.value;
  return value === 'mirror' || value === 'independent' ? value : 'keep-length';
};
// Hand the keyboard back to the canvas, so arrow keys nudge points instead of the setting.
handleSelect.addEventListener('change', () => handleSelect.blur());

interface Glyph {
  readonly name: string;
  /** Advance width as loaded; the advance guide holds the current value. */
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
/**
 * While dragging points: the path and mouse position (model units) when the drag started.
 * `independent` (an Option/Alt-drag) moves a handle on its own whatever the Handles setting
 * says. `retractId` is set for an Option/Alt-press on a handle: released without moving, the
 * handle is retracted instead.
 */
let drag: {
  startPath: Path;
  startAt: Vec2;
  independent: boolean;
  retractId: string | null;
} | null = null;
/**
 * While dragging a curve: the path before, where the drag started (model units), and what
 * was grabbed (the contour, its run index and the position t along it).
 */
let segmentDrag: {
  startPath: Path;
  startAt: Vec2;
  contourId: string;
  run: number;
  t: number;
} | null = null;
/** While dragging a selection rectangle: its corners (screen pixels) and the selection kept. */
let marquee: { start: Vec2; end: Vec2; keep: Selection } | null = null;
/** The active tool: V selects and edits points, P draws with the pen. */
let tool: 'select' | 'pen' = 'select';
let pen: PenState = idlePen;
/**
 * While pressing with the pen: the path and pen state before the press, where it started
 * (model units), and whether it closes the contour (a press on its first point).
 */
let penPress: { startPath: Path; startPen: PenState; at: Vec2; closing: boolean } | null = null;

/** The lines the last snap pulled onto, drawn while a drag or pen press lasts. */
let snapped: SnapResult | null = null;
/**
 * While dragging a guide: its id and the guides before the drag. A guide dragged out of a
 * ruler is added when the drag starts and removed again if it ends back on the ruler.
 */
let guideDrag: { id: string; startGuides: readonly Guide[] } | null = null;

/**
 * The guides: metric lines (font-wide, kept when switching glyphs; the advance width belongs
 * to the glyph) and guides added from the rulers. The baseline (y 0) and the origin (x 0) are
 * where the glyph's coordinates start, so they cannot move.
 */
let guides: readonly Guide[] = [
  { id: 'descender', axis: 'y', position: fixture.descender },
  { id: 'baseline', axis: 'y', position: 0 },
  { id: 'xHeight', axis: 'y', position: fixture.xHeight },
  { id: 'capHeight', axis: 'y', position: fixture.capHeight },
  { id: 'ascender', axis: 'y', position: fixture.ascender },
  { id: 'origin', axis: 'x', position: 0 },
  { id: 'advance', axis: 'x', position: glyph.advance },
];
const FIXED = new Set(['baseline', 'origin']);
const LABELS: Record<string, string> = {
  descender: 'descender',
  baseline: 'baseline',
  xHeight: 'x-height',
  capHeight: 'cap height',
  ascender: 'ascender',
  advance: 'advance',
};
/** Guides added from the rulers have ids from this counter; metric lines have names. */
let rulerGuides = 0;
const isRulerGuide = (id: string): boolean => id.startsWith('guide-');
const position = (id: string): number => guides.find((g) => g.id === id)?.position ?? 0;
const movableGuides = (): Guide[] => guides.filter((g) => !FIXED.has(g.id));

/** Font units to screen pixels (y flipped: fonts are y-up, the screen is y-down). */
let view: Affine = [1, 0, 0, 1, 0, 0];

/** Holding Cmd (macOS) or Ctrl (Windows, Linux) turns snapping off. */
const snapOff = (event: MouseEvent): boolean => event.metaKey || event.ctrlKey;

/** Snaps a move of `points` (font units) to the guides, recording what it snapped to. */
const snap = (points: readonly Vec2[], delta: Vec2): Vec2 => {
  const targets = guideSnapTargets(guides);
  snapped = snapDelta(points, delta, targets, SNAP_RADIUS / Math.abs(view[0]));
  return snapped.delta;
};

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

  // Guides: metric lines in grey with their name, ruler guides in teal; the one being
  // dragged is darker. Each is labelled with its value.
  ctx.lineWidth = 1;
  ctx.font = '11px system-ui, sans-serif';
  for (const g of guides) {
    const ruler = isRulerGuide(g.id);
    const dragged = g.id === guideDrag?.id;
    ctx.strokeStyle = ruler ? (dragged ? '#178' : '#7bc') : dragged ? '#888' : '#ccc';
    ctx.fillStyle = ruler ? '#178' : '#999';
    const name = LABELS[g.id];
    const label = name ? `${name} ${g.position}` : String(g.position);
    ctx.beginPath();
    if (g.axis === 'y') {
      const y = screen(vec2(0, g.position)).y;
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.clientWidth, y);
      ctx.fillText(label, RULER + 4, y - 3);
    } else {
      const x = screen(vec2(g.position, 0)).x;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.clientHeight);
      if (g.id !== 'origin') ctx.fillText(label, x + 3, RULER + 12);
    }
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

  // The pen's dragged-out handle, which the next segment will start with.
  const last = path.contours.find((c) => c.id === pen.contourId)?.points.at(-1);
  if (pen.pendingOut && last) {
    const a = screen(last);
    const b = screen(pen.pendingOut);
    ctx.strokeStyle = '#999';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#226';
    ctx.beginPath();
    ctx.arc(b.x, b.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // The lines a drag or pen press snapped to.
  ctx.strokeStyle = '#d33';
  if (snapped && snapped.x !== null) {
    const x = screen(vec2(snapped.x, 0)).x;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.clientHeight);
    ctx.stroke();
  }
  if (snapped && snapped.y !== null) {
    const y = screen(vec2(0, snapped.y)).y;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.clientWidth, y);
    ctx.stroke();
  }

  if (marquee) {
    ctx.strokeStyle = '#d33';
    ctx.setLineDash([4, 3]);
    const { start, end } = marquee;
    ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
    ctx.setLineDash([]);
  }

  drawRulers();
};

/** A tick spacing in font units that puts ticks at least 50 pixels apart: 1, 2 or 5 x 10^n. */
const tickStep = (): number => {
  const minimum = 50 / Math.abs(view[0]);
  const power = 10 ** Math.floor(Math.log10(minimum));
  return [1, 2, 5, 10].map((m) => m * power).find((step) => step >= minimum) ?? power * 10;
};

/** Rulers along the top (x in font units) and the left (y), where guides are dragged from. */
const drawRulers = (): void => {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  ctx.fillStyle = '#f4f4f4';
  ctx.fillRect(0, 0, width, RULER);
  ctx.fillRect(0, 0, RULER, height);
  ctx.strokeStyle = '#ccc';
  ctx.fillStyle = '#777';
  ctx.font = '10px system-ui, sans-serif';
  const step = tickStep();
  const topLeft = toModel(vec2(0, 0));
  const bottomRight = toModel(vec2(width, height));
  ctx.beginPath();
  for (let x = Math.ceil(topLeft.x / step) * step; x <= bottomRight.x; x += step) {
    const sx = screen(vec2(x, 0)).x;
    if (sx < RULER) continue;
    ctx.moveTo(sx, RULER - 6);
    ctx.lineTo(sx, RULER);
    ctx.fillText(String(x), sx + 2, RULER - 8);
  }
  // Font y points up, so the bottom of the screen has the smallest y.
  for (let y = Math.ceil(bottomRight.y / step) * step; y <= topLeft.y; y += step) {
    const sy = screen(vec2(0, y)).y;
    if (sy < RULER) continue;
    ctx.moveTo(RULER - 6, sy);
    ctx.lineTo(RULER, sy);
    ctx.save();
    ctx.translate(RULER - 8, sy - 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(String(y), 0, 0);
    ctx.restore();
  }
  ctx.moveTo(0, RULER + 0.5);
  ctx.lineTo(width, RULER + 0.5);
  ctx.moveTo(RULER + 0.5, 0);
  ctx.lineTo(RULER + 0.5, height);
  ctx.stroke();
};

const direction = (c: Contour): string =>
  contourArea(c) > 0 ? 'counter-clockwise' : contourArea(c) < 0 ? 'clockwise' : 'no area';

const showInfo = (): void => {
  const bounds = segmentsBounds(path.contours.flatMap(toSegments));
  const rows = path.contours.map((c, i) => {
    const before = glyph.original.contours.at(i);
    const now = direction(c);
    const was = before ? direction(before) : null;
    const change = was === null ? 'new' : was === now ? 'unchanged' : `was ${was}`;
    return `<p>Contour ${i + 1}: ${c.points.length} points, ${now} (${change})</p>`;
  });
  const chosen = path.contours.flatMap((c) => c.points).filter((p) => selection.has(p.id));
  const only = chosen.length === 1 ? chosen[0] : undefined;
  const help =
    tool === 'pen'
      ? '<p><b>Pen</b> (V: select tool). Click to add a corner, drag to add a smooth anchor. ' +
        'Click the first point to close, or press Escape to stop. New points snap to the ' +
        'metric lines and side bearings; hold Cmd/Ctrl to place without snapping. ' +
        'Click the end of an open contour to continue it. Click on an outline to add a point ' +
        'there.</p>'
      : '<p><b>Select</b> (P: pen tool). Click a point to select it, shift-click to add, or ' +
        'drag a rectangle around points.</p>' +
        '<p>Drag or use the arrow keys to move (shift: straight, or 10 units).</p>' +
        '<p>Dragged points snap to the metric lines and side bearings. Hold Cmd/Ctrl to drag ' +
        'without snapping (shift also turns it off while it keeps the drag straight).</p>' +
        '<p>Drag a curve to reshape it, or a straight segment to move it.</p>' +
        '<p>Drag a metric line or the advance width line to change it. The baseline and ' +
        'x 0 are fixed.</p>' +
        '<p>Drag from a ruler to add a guide; drag a guide back onto its ruler to remove it.</p>' +
        '<p>Double-click an anchor to switch between smooth and corner.</p>' +
        '<p>Option/Alt-click an anchor to reset its handles, or a handle to retract it. ' +
        'Option/Alt-drag a handle to move it on its own.</p>' +
        '<p>The Handles setting decides what the other handle of a smooth anchor does when ' +
        'you drag one: turn and keep its length, turn and mirror the length, or stay put.</p>';
  const point = only
    ? `<p>${only.id}: ${only.type}${only.smooth ? ', smooth' : ''}</p><p>x ${only.x}, y ${only.y}</p>`
    : chosen.length > 1
      ? `<p>${chosen.length} points selected</p>`
      : '<p>No points selected.</p>';
  info.innerHTML = `
    <h2>Glyph "${glyph.name}"</h2>
    <p>Advance width ${position('advance')}</p>
    <p>Bounds x ${bounds.minX} to ${bounds.maxX}, y ${bounds.minY} to ${bounds.maxY}</p>
    <h2 style="margin-top:12px">Contours</h2>${rows.join('')}
    <p style="color:#666">Green point: contour start. Outer contours should be counter-clockwise, holes clockwise.</p>
    <h2 style="margin-top:12px">Tool</h2>${help}
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

/** Replaces the outline and guides with the result of an edit and makes it one undo step. */
const commit = (next: EditState): void => {
  history = record(history, diff({ path, guides }, next));
  ({ path, guides } = next);
};
/** The same for an edit that only changes the outline. */
const commitPath = (next: Path): void => commit({ path: next, guides });

/** The path and pen state for a pen press, with the mouse now at `dragTo` (model units). */
const penResult = (press: NonNullable<typeof penPress>, dragTo: Vec2) =>
  press.closing
    ? penClose(press.startPath, press.startPen, dragTo, ids)
    : penAdd(press.startPath, press.startPen, press.at, dragTo, ids);

canvas.addEventListener('mousedown', (event) => {
  const at = toModel(mouse(event));
  const onTop = event.offsetY < RULER;
  if (onTop || event.offsetX < RULER) {
    // A press on a ruler pulls out a new guide: horizontal from the top, vertical from the left.
    const id = `guide-${(rulerGuides += 1)}`;
    const axis = onTop ? 'y' : 'x';
    guideDrag = { id, startGuides: guides };
    guides = [...guides, { id, axis, position: Math.round(axis === 'x' ? at.x : at.y) }];
    draw();
    return;
  }
  const hit = pointUnder(event);
  if (tool === 'pen') {
    selection = new Set();
    // A click on an outline (not on a point) adds a point there.
    const segment = hit ? null : hitTestSegment(path, mouse(event), view, HIT_RADIUS);
    if (segment && segment.t > 0 && segment.t < 1) {
      commitPath({
        contours: path.contours.map((c) =>
          c.id === segment.contourId
            ? insertPoint(c, segment.segmentIndex, segment.t, ids).contour
            : c,
        ),
      });
      draw();
      showInfo();
      return;
    }
    const first = path.contours.find((c) => c.id === pen.contourId)?.points[0];
    const continued = pen.contourId === null && hit ? penContinue(path, hit.id) : null;
    if (continued) {
      commitPath(continued.path);
      pen = continued.pen;
    } else {
      const closing = hit !== null && hit.id === first?.id;
      const placed =
        closing && first ? first : snapOff(event) ? at : add(at, snap([at], vec2(0, 0)));
      penPress = { startPath: path, startPen: pen, at: placed, closing };
      ({ path, pen } = penResult(penPress, penPress.at));
    }
    draw();
    showInfo();
    return;
  }
  if (event.altKey && hit && isOnCurve(hit)) {
    commitPath(resetHandles(path, hit.id, ids));
    selection = new Set([hit.id]);
  } else if (event.altKey && hit) {
    selection = new Set([hit.id]);
    drag = { startPath: path, startAt: at, independent: true, retractId: hit.id };
  } else if (!hit) {
    // On a curve: reshape it. On a straight segment: move it (its two anchors).
    // Anywhere else: a selection rectangle.
    const segment = hitTestSegment(path, mouse(event), view, HIT_RADIUS);
    const contour = path.contours.find((c) => c.id === segment?.contourId);
    if (segment?.kind === 'cubic') {
      selection = new Set();
      const { contourId, run, t } = segment;
      segmentDrag = { startPath: path, startAt: at, contourId, run, t };
    } else if (segment?.kind === 'line' && contour) {
      const line = contourRuns(contour)[segment.run];
      const ends = [line?.start, line?.end].map((i) => contour.points[i ?? -1]?.id ?? '');
      selection = new Set(ends);
      drag = { startPath: path, startAt: at, independent: false, retractId: null };
    } else {
      const guide = hitTestGuide(movableGuides(), mouse(event), view, HIT_RADIUS);
      if (guide) {
        guideDrag = { id: guide.id, startGuides: guides };
      } else {
        const keep = event.shiftKey ? selection : new Set<string>();
        marquee = { start: mouse(event), end: mouse(event), keep };
        selection = keep;
      }
    }
  } else {
    if (event.shiftKey) {
      const next = new Set(selection);
      if (next.has(hit.id)) next.delete(hit.id);
      else next.add(hit.id);
      selection = next;
    } else if (!selection.has(hit.id)) {
      selection = new Set([hit.id]);
    }
    if (selection.has(hit.id)) {
      drag = { startPath: path, startAt: at, independent: false, retractId: null };
    }
  }
  draw();
  showInfo();
});

canvas.addEventListener('mousemove', (event) => {
  if (penPress) {
    ({ path, pen } = penResult(penPress, toModel(mouse(event))));
    draw();
    return;
  }
  if (segmentDrag) {
    const delta = sub(toModel(mouse(event)), segmentDrag.startAt);
    const { startPath, contourId, run, t } = segmentDrag;
    path = dragSegment(startPath, contourId, run, t, delta);
    draw();
    return;
  }
  if (guideDrag) {
    // Guides sit on whole font units, as designers set metrics.
    const at = toModel(mouse(event));
    const { id } = guideDrag;
    guides = guides.map((g) =>
      g.id === id ? { ...g, position: Math.round(g.axis === 'x' ? at.x : at.y) } : g,
    );
    draw();
    showInfo();
    return;
  }
  if (marquee) {
    marquee.end = mouse(event);
    const inside = pointsInRect(path, marquee.start, marquee.end, view).map((p) => p.id);
    selection = new Set([...marquee.keep, ...inside]);
    draw();
    showInfo();
    return;
  }
  if (drag) {
    const delta = sub(toModel(mouse(event)), drag.startAt);
    const moving = drag.startPath.contours.flatMap((c) =>
      c.points.filter((p) => selection.has(p.id)),
    );
    snapped = null;
    let adjusted = delta;
    if (event.shiftKey) adjusted = constrainDelta(delta);
    else if (!snapOff(event)) adjusted = snap(moving, delta);
    const handles = drag.independent ? 'independent' : handleMode();
    path = movePoints(drag.startPath, selection, adjusted, { handles });
    draw();
    showInfo();
    return;
  }
  if (event.offsetY < RULER || event.offsetX < RULER) {
    canvas.style.cursor = event.offsetY < RULER ? 'row-resize' : 'col-resize';
    return;
  }
  const next = pointUnder(event)?.id ?? null;
  const onSegment = next === null && hitTestSegment(path, mouse(event), view, HIT_RADIUS) !== null;
  const guide =
    next === null && !onSegment
      ? hitTestGuide(movableGuides(), mouse(event), view, HIT_RADIUS)
      : null;
  if (tool === 'pen') canvas.style.cursor = onSegment ? 'copy' : 'crosshair';
  else if (next) canvas.style.cursor = 'pointer';
  else if (onSegment) canvas.style.cursor = 'move';
  else if (guide) canvas.style.cursor = guide.axis === 'x' ? 'col-resize' : 'row-resize';
  else canvas.style.cursor = 'default';
  if (next !== hoveredId) {
    hoveredId = next;
    draw();
  }
});

window.addEventListener('mouseup', (event) => {
  snapped = null;
  if (guideDrag) {
    // A ruler guide dropped back on its ruler is removed. The whole drag is one undo step.
    const { id, startGuides } = guideDrag;
    const dropped = guides.find((g) => g.id === id);
    const rect = canvas.getBoundingClientRect();
    const onRuler =
      dropped?.axis === 'y' ? event.clientY - rect.top < RULER : event.clientX - rect.left < RULER;
    const final = isRulerGuide(id) && onRuler ? guides.filter((g) => g.id !== id) : guides;
    guides = startGuides;
    commit({ path, guides: final });
    guideDrag = null;
    draw();
    showInfo();
    return;
  }
  if (penPress) {
    // The whole press, including any drag, is one undo step.
    const drawn = path;
    path = penPress.startPath;
    commitPath(drawn);
    penPress = null;
    draw();
    showInfo();
    return;
  }
  if (segmentDrag) {
    // The whole drag is one undo step.
    const reshaped = path;
    path = segmentDrag.startPath;
    commitPath(reshaped);
    segmentDrag = null;
    draw();
    showInfo();
    return;
  }
  if (marquee) {
    marquee = null;
    draw();
    return;
  }
  if (!drag) return;
  const moved = path;
  path = drag.startPath;
  // The whole drag is one undo step. An Option/Alt-click on a handle retracts it.
  if (moved === drag.startPath && drag.retractId) commitPath(retractHandle(path, drag.retractId));
  else commitPath(moved);
  // A retracted handle may have been removed (its segment became a line).
  const exists = new Set(path.contours.flatMap((c) => c.points.map((p) => p.id)));
  selection = new Set([...selection].filter((id) => exists.has(id)));
  drag = null;
  draw();
  showInfo();
});

canvas.addEventListener('dblclick', (event) => {
  const hit = pointUnder(event);
  if (tool !== 'select' || !hit || !isOnCurve(hit) || event.altKey) return;
  commitPath(toggleSmooth(path, hit.id));
  draw();
  showInfo();
});

const ARROWS: Record<string, Vec2> = {
  ArrowLeft: vec2(-1, 0),
  ArrowRight: vec2(1, 0),
  ArrowUp: vec2(0, 1),
  ArrowDown: vec2(0, -1),
};

const toolButtons = document.querySelectorAll<HTMLButtonElement>('#tools button');

const setTool = (next: typeof tool): void => {
  tool = next;
  pen = idlePen;
  selection = new Set();
  canvas.style.cursor = tool === 'pen' ? 'crosshair' : 'default';
  for (const b of toolButtons) b.setAttribute('aria-pressed', String(b.dataset['tool'] === tool));
};

for (const button of toolButtons) {
  button.addEventListener('click', () => {
    const name = button.dataset['tool'];
    if (name === 'select' || name === 'pen') setTool(name);
    draw();
    showInfo();
  });
}

window.addEventListener('keydown', (event) => {
  if (drag || segmentDrag || guideDrag || marquee || penPress) return;
  const plain = !event.metaKey && !event.ctrlKey && !event.altKey;
  if (plain && (event.key === 'v' || event.key === 'p' || event.key === 'Escape')) {
    if (event.key === 'Escape') pen = idlePen;
    else setTool(event.key === 'v' ? 'select' : 'pen');
    draw();
    showInfo();
    return;
  }
  const arrow = ARROWS[event.key];
  if (arrow) {
    event.preventDefault();
    if (selection.size === 0) return;
    const step = event.shiftKey ? NUDGE_LARGE : NUDGE;
    // Each key press is one undo step; font y points up, so ArrowUp adds to y.
    commitPath(movePoints(path, selection, vec2(arrow.x * step, arrow.y * step)));
    draw();
    showInfo();
    return;
  }
  if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;
  event.preventDefault();
  const result = event.shiftKey ? redo(history, { path, guides }) : undo(history, { path, guides });
  if (!result) return;
  history = result.history;
  ({ path, guides } = result.state);
  // Undo can remove the contour being drawn or its last point, so stop drawing.
  pen = idlePen;
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
    guides = guides.map((g) => (g.id === 'advance' ? { ...g, position: glyph.advance } : g));
    history = emptyHistory;
    selection = new Set();
    hoveredId = null;
    drag = null;
    segmentDrag = null;
    guideDrag = null;
    marquee = null;
    pen = idlePen;
    penPress = null;
    for (const b of nav.querySelectorAll('button')) {
      b.setAttribute('aria-pressed', String(b === button));
    }
    render();
  });
  nav.append(button);
}

render();
