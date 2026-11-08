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
