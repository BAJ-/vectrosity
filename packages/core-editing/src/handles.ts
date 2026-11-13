import { add, length, scale, sub, type Vec2 } from '@vcore/geometry';
import {
  contourRuns,
  curveToLine,
  lineToCurve,
  type Contour,
  type IdGenerator,
  type Path,
  type Point,
  type Run,
} from '@vcore/path';

const replaceContour = (path: Path, contour: Contour): Path => ({
  contours: path.contours.map((c) => (c.id === contour.id ? contour : c)),
});

const findPoint = (path: Path, pointId: string): { contour: Contour; index: number } | null => {
  for (const contour of path.contours) {
    const index = contour.points.findIndex((p) => p.id === pointId);
    if (index >= 0) return { contour, index };
  }
  return null;
};

const setPosition = (c: Contour, index: number, at: Vec2): Contour => ({
  ...c,
  points: c.points.map((p, i) => (i === index ? { ...p, x: at.x, y: at.y } : p)),
});

/** A cubic run: a 'curve' run with exactly two off-curve points. */
const isCubicRun = (run: Run): boolean => run.type === 'curve' && run.offs.length === 2;

/**
 * Gives an anchor a fresh pair of handles. Straight segments next to the anchor become
 * cubics first, so an anchor with one handle (or none) gets one on each side.
 * The handles are placed on one line through the anchor, parallel to the line from the
 * previous anchor to the next, each 1/3 as long as the distance to the anchor on its side.
 * With handles on both sides the anchor is marked smooth.
 * Quadratic segments are left alone. Structure-changing when a line becomes a cubic.
 */
export const resetHandles = (path: Path, anchorId: string, ids: IdGenerator): Path => {
  const found = findPoint(path, anchorId);
  if (!found || found.contour.points[found.index]?.type === 'offcurve') return path;
  let c = found.contour;
  // Lines first; indices shift as points are added, so look the runs up again each time.
  for (const side of ['in', 'out'] as const) {
    const i = c.points.findIndex((p) => p.id === anchorId);
    const runs = contourRuns(c);
    const k = runs.findIndex((r) => (side === 'in' ? r.end : r.start) === i);
    if (k >= 0) c = lineToCurve(c, k, ids);
  }
  const i = c.points.findIndex((p) => p.id === anchorId);
  const anchor = c.points[i];
  if (!anchor) return path;
  const runs = contourRuns(c);
  const incoming = runs.find((r) => r.end === i && isCubicRun(r));
  const outgoing = runs.find((r) => r.start === i && isCubicRun(r));
  const prev: Point | undefined = incoming && c.points[incoming.start];
  const next: Point | undefined = outgoing && c.points[outgoing.end];
  const direction = sub(next ?? anchor, prev ?? anchor);
  if (length(direction) === 0) return replaceContour(path, c);
  const unit = scale(direction, 1 / length(direction));
  if (incoming && prev) {
    const handle = incoming.offs[1] ?? 0;
    c = setPosition(c, handle, sub(anchor, scale(unit, length(sub(anchor, prev)) / 3)));
  }
  if (outgoing && next) {
    const handle = outgoing.offs[0] ?? 0;
    c = setPosition(c, handle, add(anchor, scale(unit, length(sub(next, anchor)) / 3)));
  }
  if (incoming && outgoing) {
    c = { ...c, points: c.points.map((p) => (p.id === anchorId ? { ...p, smooth: true } : p)) };
  }
  return replaceContour(path, c);
};

/**
 * Moves a cubic's handle onto its anchor. When the segment's other handle is already on
 * its own anchor, the segment has no handles left and becomes a straight line.
 * Structure-changing in that case; otherwise only the handle moves.
 */
export const retractHandle = (path: Path, handleId: string): Path => {
  const found = findPoint(path, handleId);
  if (!found) return path;
  const runs = contourRuns(found.contour);
  const k = runs.findIndex((r) => r.offs.includes(found.index));
  const run = runs[k];
  if (!run || !isCubicRun(run)) return path;
  const [first = 0, second = 0] = run.offs;
  const ownerOf = (off: number) => (off === first ? run.start : run.end);
  const other = found.index === first ? second : first;
  const owner = found.contour.points[ownerOf(found.index)];
  if (!owner) return path;
  const c = setPosition(found.contour, found.index, owner);
  const otherPoint = c.points[other];
  const otherOwner = c.points[ownerOf(other)];
  const bothRetracted =
    otherPoint !== undefined &&
    otherOwner !== undefined &&
    otherPoint.x === otherOwner.x &&
    otherPoint.y === otherOwner.y;
  return replaceContour(path, bothRetracted ? curveToLine(c, k) : c);
};

/** One side of an anchor: its handle (if the segment is a cubic) and the direction it points. */
interface Side {
  readonly handle: number | null;
  /** Unit vector pointing away from the anchor, or null when there is no usable direction. */
  readonly direction: Vec2 | null;
}

const unitOrNull = (v: Vec2): Vec2 | null => {
  const l = length(v);
  return l === 0 ? null : scale(v, 1 / l);
};

const sideOf = (c: Contour, anchor: Point, run: Run | undefined, incoming: boolean): Side => {
  if (run && isCubicRun(run)) {
    const handle = (incoming ? run.offs[1] : run.offs[0]) ?? 0;
    const at = c.points[handle];
    return { handle, direction: at ? unitOrNull(sub(at, anchor)) : null };
  }
  if (run?.type === 'line') {
    const other = c.points[incoming ? run.start : run.end];
    return { handle: null, direction: other ? unitOrNull(sub(other, anchor)) : null };
  }
  return { handle: null, direction: null };
};

/**
 * Switches an anchor between corner and smooth. Making it smooth lines its handles up,
 * keeping their lengths: two handles turn to the direction halfway between them; a handle
 * next to a straight segment turns to continue the line. An anchor with no handle, or with
 * straight segments on both sides, is returned unchanged. Structure-preserving.
 */
export const toggleSmooth = (path: Path, anchorId: string): Path => {
  const found = findPoint(path, anchorId);
  const anchor = found?.contour.points[found.index];
  if (!found || !anchor || anchor.type === 'offcurve') return path;
  const i = found.index;
  let c = found.contour;
  const setSmooth = (smooth: boolean): Contour => ({
    ...c,
    points: c.points.map((p, k) => (k === i ? { ...p, smooth } : p)),
  });
  if (anchor.smooth) return replaceContour(path, setSmooth(false));
  const runs = contourRuns(c);
  const incoming = runs.find((r) => r.end === i);
  const outgoing = runs.find((r) => r.start === i);
  const before = sideOf(c, anchor, incoming, true);
  const after = sideOf(c, anchor, outgoing, false);
  if (before.handle === null && after.handle === null) return path;
  // The direction the outline runs through the anchor, from `before` towards `after`:
  // along a straight segment if there is one, else halfway between the two handles.
  let through: Vec2 | null;
  if (before.handle === null && before.direction) {
    through = scale(before.direction, -1);
  } else if (after.handle === null && after.direction) {
    through = after.direction;
  } else if (before.direction && after.direction) {
    through = unitOrNull(sub(after.direction, before.direction)) ?? after.direction;
  } else {
    // One handle has no length: follow the other one.
    through = after.direction ?? (before.direction && scale(before.direction, -1));
  }
  if (!through) return path;
  for (const [side, sign] of [
    [before, -1],
    [after, 1],
  ] as const) {
    const at = side.handle === null ? undefined : c.points[side.handle];
    if (side.handle === null || !at) continue;
    const handleLength = length(sub(at, anchor));
    c = setPosition(c, side.handle, add(anchor, scale(through, sign * handleLength)));
  }
  return replaceContour(path, setSmooth(true));
};
