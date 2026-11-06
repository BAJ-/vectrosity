import { lerp, split, vec2, type Vec2 } from '@vcore/geometry';
import type { IdGenerator } from './ids';
import { isClosed, isOnCurve, type Contour, type Point, type PointType } from './model';
import { contourRuns, pointAt, type Run } from './runs';
import { contourSegments, runSegments } from './segments';

// Each operation says whether it is structure-preserving (same points in the same cyclic
// order, same IDs) or structure-changing (points added or removed). Interpolation between
// font masters needs structure-preserving edits; see the plan's notes on variable fonts.

const indexOfId = (c: Contour, pointId: string): number => {
  const i = c.points.findIndex((p) => p.id === pointId);
  if (i < 0) throw new RangeError(`contour ${c.id} has no point ${pointId}`);
  return i;
};

const withType = (p: Point, type: PointType): Point => ({ ...p, type });

/**
 * The same outline traversed the other way. Structure-preserving: same points, IDs and
 * smooth flags; only the order and the on-curve types change (a type describes the segment
 * arriving at a point, and every segment now arrives from the other side).
 * A closed contour keeps its first point; an open contour's last point becomes its 'move'.
 */
export const reverseContour = (c: Contour): Contour => {
  const runs = contourRuns(c);
  // After reversing, the segment that arrives at a run's start point is that run, reversed.
  const newType = new Map<number, PointType>();
  for (const run of runs) newType.set(run.start, run.type);
  const typed = c.points.map((p, i) => (isOnCurve(p) ? withType(p, newType.get(i) ?? p.type) : p));
  if (isClosed(c)) {
    const [first, ...rest] = typed;
    return first ? { ...c, points: [first, ...rest.reverse()] } : c;
  }
  const reversed = [...typed].reverse();
  const [first, ...rest] = reversed;
  return first ? { ...c, points: [withType(first, 'move'), ...rest] } : c;
};

/**
 * Makes an on-curve point the first point of a closed contour. Structure-preserving:
 * the cyclic order is unchanged. Throws for open contours and off-curve points.
 */
export const setStartPoint = (c: Contour, pointId: string): Contour => {
  if (!isClosed(c)) throw new RangeError('only a closed contour can change its start point');
  const i = indexOfId(c, pointId);
  if (!isOnCurve(pointAt(c, i))) throw new RangeError('the start point must be on-curve');
  return { ...c, points: [...c.points.slice(i), ...c.points.slice(0, i)] };
};

/**
 * Opens a closed contour at an on-curve point, which becomes both the start and the end.
 * Structure-changing: the end gets a copy of the point with a new ID.
 */
export const openContour = (c: Contour, pointId: string, ids: IdGenerator): Contour => {
  const rotated = setStartPoint(c, pointId);
  const [first, ...rest] = rotated.points;
  if (!first) return c;
  return { ...c, points: [withType(first, 'move'), ...rest, { ...first, id: ids() }] };
};

/**
 * Closes an open contour. If its last point sits exactly on its first, the two are merged
 * (the first point is kept, with the last point's type); otherwise a straight closing line
 * is added. Structure-changing when points are merged.
 */
export const closeContour = (c: Contour): Contour => {
  if (isClosed(c)) return c;
  const first = c.points.at(0);
  const last = c.points.at(-1);
  if (!first || !last) return c;
  if (c.points.length > 1 && last.x === first.x && last.y === first.y) {
    return { ...c, points: [withType(first, last.type), ...c.points.slice(1, -1)] };
  }
  return { ...c, points: [withType(first, 'line'), ...c.points.slice(1)] };
};

/** Replaces a run's off-curve points with `middle`, keeping everything else in place. */
const replaceRunMiddle = (c: Contour, run: Run, middle: readonly Point[]): Contour => {
  const skip = new Set(run.offs);
  const points: Point[] = [];
  c.points.forEach((p, i) => {
    if (skip.has(i)) return;
    points.push(p);
    if (i === run.start) points.push(...middle);
  });
  return { ...c, points };
};

const offPoint = (id: string, p: Vec2): Point => ({ id, x: p.x, y: p.y, type: 'offcurve' });

/**
 * Turns the implied on-curve points of a 'qcurve' run (halfway between two off-curve points)
 * into real points. The outline does not change. Structure-changing: adds points.
 */
export const makeImpliedPointsExplicit = (
  c: Contour,
  runIndex: number,
  ids: IdGenerator,
): Contour => {
  const run = contourRuns(c).at(runIndex);
  if (!run || run.type !== 'qcurve' || run.offs.length < 2) return c;
  const offs = run.offs.map((i) => pointAt(c, i));
  const middle: Point[] = [];
  offs.forEach((o, k) => {
    middle.push(o);
    const next = offs.at(k + 1);
    if (next) {
      const m = lerp(vec2(o.x, o.y), vec2(next.x, next.y), 0.5);
      middle.push({ id: ids(), x: m.x, y: m.y, type: 'qcurve', smooth: true });
    }
  });
  return replaceRunMiddle(c, run, middle);
};

/**
 * Adds an on-curve point at parameter t (strictly between 0 and 1) of a segment, splitting
 * it so the outline does not change. The new point is smooth unless the segment is a line.
 * Existing points keep their IDs (handles that move keep theirs too). Structure-changing.
 * Returns the new contour and the new point's ID.
 */
export const insertPoint = (
  c: Contour,
  segmentIndex: number,
  t: number,
  ids: IdGenerator,
): { contour: Contour; pointId: string } => {
  if (!(t > 0 && t < 1)) throw new RangeError('t must be strictly between 0 and 1');
  const located = contourSegments(c).at(segmentIndex);
  if (!located) throw new RangeError(`contour ${c.id} has no segment ${segmentIndex}`);
  if (located.pieces > 1) {
    // Implied points depend on their neighbours; make them real first so a split stays exact.
    // The segment keeps its index: each implied piece was already counted as a segment.
    return insertPoint(makeImpliedPointsExplicit(c, located.run, ids), segmentIndex, t, ids);
  }
  const run = contourRuns(c).at(located.run);
  if (!run) throw new RangeError('unreachable: segment has a run');
  const [segment] = runSegments(c, run);
  if (!segment) throw new RangeError('unreachable: run has a segment');
  const offs = run.offs.map((i) => pointAt(c, i));
  const pointId = ids();
  let middle: Point[];
  switch (segment.kind) {
    case 'line': {
      const m = lerp(segment.p0, segment.p1, t);
      middle = [{ id: pointId, x: m.x, y: m.y, type: 'line' }];
      break;
    }
    case 'quad': {
      const [a, b] = split(segment, t);
      const firstOff = offs.at(0)?.id ?? ids();
      middle = [
        offPoint(firstOff, a.p1),
        { id: pointId, x: a.p2.x, y: a.p2.y, type: run.type, smooth: true },
        offPoint(ids(), b.p1),
      ];
      break;
    }
    case 'cubic': {
      const [a, b] = split(segment, t);
      middle = [
        offPoint(offs.at(0)?.id ?? ids(), a.p1),
        offPoint(ids(), a.p2),
        { id: pointId, x: a.p3.x, y: a.p3.y, type: 'curve', smooth: true },
        offPoint(ids(), b.p1),
        offPoint(offs.at(1)?.id ?? ids(), b.p2),
      ];
      break;
    }
  }
  return { contour: replaceRunMiddle(c, run, middle), pointId };
};

/**
 * Removes one point. Structure-changing; the outline changes too (no refitting yet).
 * - An off-curve point: its segment loses one handle (a cubic becomes a quadratic, and so on).
 * - An on-curve point: it is removed with its own two handles (the off-curve points next to
 *   it), and its neighbours are joined using their remaining handles.
 * - The 'move' point of an open contour: the next on-curve point becomes the start.
 * Returns null when nothing usable is left (no on-curve points, or an open contour with
 * fewer than two).
 */
export const deletePoint = (c: Contour, pointId: string): Contour | null => {
  const i = indexOfId(c, pointId);
  const target = pointAt(c, i);
  const closed = isClosed(c);
  let points: Point[];
  if (target.type === 'offcurve') {
    points = c.points.filter((_, k) => k !== i);
    // A 'curve' point may keep at most 2 handles; the run can only shrink here, so it stays valid.
  } else if (!closed && i === 0) {
    // Drop the start and everything up to the next on-curve point, which becomes the 'move'.
    const next = c.points.findIndex((p, k) => k > 0 && isOnCurve(p));
    if (next < 0) return null;
    const nextPoint = pointAt(c, next);
    points = [withType(nextPoint, 'move'), ...c.points.slice(next + 1)];
  } else {
    const runs = contourRuns(c);
    const incoming = runs.find((r) => r.end === i);
    const outgoing = runs.find((r) => r.start === i);
    const remove = new Set<number>([i]);
    // Its own handles: the last off-curve of the incoming run, the first of the outgoing run.
    const ownIn = incoming?.offs.at(-1);
    const ownOut = outgoing?.offs.at(0);
    if (ownIn !== undefined) remove.add(ownIn);
    if (ownOut !== undefined) remove.add(ownOut);
    points = c.points.filter((_, k) => !remove.has(k));
    if (!outgoing && !closed) {
      // The last point of an open contour: trailing off-curve points must go as well.
      while (points.at(-1)?.type === 'offcurve') points.pop();
    } else if (outgoing && incoming) {
      // The joined run ends at the outgoing run's end point and takes that point's type.
      // A 'curve' end can hold at most 2 handles: keep the outermost ones if there are more.
      const endPoint = pointAt(c, outgoing.end);
      const keptOffs = [...incoming.offs, ...outgoing.offs].filter((k) => !remove.has(k));
      if (endPoint.type === 'curve' && keptOffs.length > 2) {
        const drop = new Set(keptOffs.slice(1, -1).map((k) => pointAt(c, k).id));
        points = points.filter((p) => !drop.has(p.id));
      }
      // A 'line' end cannot have handles: the joined segment takes the incoming segment's type.
      if (endPoint.type === 'line' && keptOffs.length > 0) {
        points = points.map((p) => (p.id === endPoint.id ? withType(p, incoming.type) : p));
      }
    }
  }
  const onCount = points.filter(isOnCurve).length;
  if (onCount === 0 || (!closed && onCount < 2)) return null;
  return { ...c, points };
};
