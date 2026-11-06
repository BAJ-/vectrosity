import { cubic, endPoint, line, quad, lerp, vec2, type Segment, type Vec2 } from '@vcore/geometry';
import type { IdGenerator } from './ids';
import type { Contour, Point } from './model';
import { contourRuns, pointAt, type Run } from './runs';

/** A segment of a contour, with the run it belongs to. */
export interface ContourSegment {
  readonly segment: Segment;
  /** Index into contourRuns(contour). */
  readonly run: number;
  /** A 'qcurve' run with k > 1 off-curve points makes k segments; this is the position in it. */
  readonly piece: number;
  readonly pieces: number;
}

const at = (p: Point): Vec2 => vec2(p.x, p.y);

/** The segments one run draws. */
export const runSegments = (c: Contour, run: Run): Segment[] => {
  const start = at(pointAt(c, run.start));
  const end = at(pointAt(c, run.end));
  const offs = run.offs.map((i) => at(pointAt(c, i)));
  if (offs.length === 0) return [line(start, end)];
  const [o1, o2] = offs;
  if (run.type === 'curve') {
    if (offs.length === 1 && o1) return [quad(start, o1, end)];
    if (offs.length === 2 && o1 && o2) return [cubic(start, o1, o2, end)];
    throw new RangeError(`'curve' point ${pointAt(c, run.end).id} has ${offs.length} off-curves`);
  }
  // 'qcurve': consecutive off-curve points have an implied on-curve point halfway between them.
  const segments: Segment[] = [];
  let from = start;
  offs.forEach((o, i) => {
    const next = offs.at(i + 1);
    const to = next ? lerp(o, next, 0.5) : end;
    segments.push(quad(from, o, to));
    from = to;
  });
  return segments;
};

/** Every segment of the contour in order, with where each one comes from. */
export const contourSegments = (c: Contour): ContourSegment[] =>
  contourRuns(c).flatMap((run, runIndex) => {
    const segments = runSegments(c, run);
    return segments.map((segment, piece) => ({
      segment,
      run: runIndex,
      piece,
      pieces: segments.length,
    }));
  });

/** The contour's outline as plain geometry segments. */
export const toSegments = (c: Contour): Segment[] => contourSegments(c).map((s) => s.segment);

const point = (ids: IdGenerator, p: Vec2, type: Point['type']): Point => ({
  id: ids(),
  x: p.x,
  y: p.y,
  type,
});

/** The off-curve points and end point that draw one segment, in UFO form. */
const segmentPoints = (ids: IdGenerator, s: Segment): Point[] => {
  switch (s.kind) {
    case 'line':
      return [point(ids, s.p1, 'line')];
    case 'quad':
      return [point(ids, s.p1, 'offcurve'), point(ids, s.p2, 'qcurve')];
    case 'cubic':
      return [
        point(ids, s.p1, 'offcurve'),
        point(ids, s.p2, 'offcurve'),
        point(ids, s.p3, 'curve'),
      ];
  }
};

/**
 * Builds a contour from consecutive segments (each starting where the previous one ends).
 * Every point gets a new ID, and no point is marked smooth.
 *
 * Closed: if the last segment ends exactly where the first starts, that point is shared;
 * otherwise a straight closing line from the last end back to the first start is implied,
 * as in the UFO format.
 */
export const contourFromSegments = (
  segments: readonly Segment[],
  closed: boolean,
  ids: IdGenerator,
): Contour => {
  const first = segments.at(0);
  const last = segments.at(-1);
  if (!first || !last) throw new RangeError('a contour needs at least one segment');
  const body = segments.flatMap((s) => segmentPoints(ids, s));
  const id = ids();
  if (!closed) return { id, points: [point(ids, first.p0, 'move'), ...body] };
  const lastEnd = endPoint(last);
  if (lastEnd.x === first.p0.x && lastEnd.y === first.p0.y) {
    // The final end point is also the start: move it to the front.
    const shared = body.at(-1);
    if (!shared) throw new RangeError('unreachable: body has points');
    return { id, points: [shared, ...body.slice(0, -1)] };
  }
  return { id, points: [point(ids, first.p0, 'line'), ...body] };
};
