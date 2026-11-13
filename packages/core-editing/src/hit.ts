import {
  apply,
  distance,
  mapPoints,
  nearestPoint,
  type Affine,
  type Segment,
  type Vec2,
} from '@vcore/geometry';
import { contourSegments, isOnCurve, type Path, type Point } from '@vcore/path';

/**
 * The point nearest to `at` (screen coordinates) within `radius` screen pixels, or null.
 * `view` maps model coordinates to screen coordinates. When an on-curve and an off-curve point
 * are equally near (a retracted handle sits on its anchor), the on-curve point wins.
 */
export const hitTestPoint = (path: Path, at: Vec2, view: Affine, radius: number): Point | null => {
  let best: Point | null = null;
  let bestDistance = radius;
  for (const c of path.contours) {
    for (const p of c.points) {
      const d = distance(apply(view, p), at);
      const wins = best === null || (!isOnCurve(best) && isOnCurve(p));
      if (d < bestDistance || (d === bestDistance && wins)) {
        best = p;
        bestDistance = d;
      }
    }
  }
  return best;
};

/**
 * The points inside the rectangle with corners `a` and `b` (screen coordinates, edges
 * included). `view` maps model coordinates to screen coordinates.
 */
export const pointsInRect = (path: Path, a: Vec2, b: Vec2, view: Affine): Point[] => {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  return path.contours.flatMap((c) =>
    c.points.filter((p) => {
      const s = apply(view, p);
      return s.x >= minX && s.x <= maxX && s.y >= minY && s.y <= maxY;
    }),
  );
};

/** Where a click landed on the outline. */
export interface SegmentHit {
  readonly contourId: string;
  /** Index into contourSegments(contour), as insertPoint takes it. */
  readonly segmentIndex: number;
  /** Index into contourRuns(contour), as dragSegment takes it. */
  readonly run: number;
  /** Position along the segment, from 0 at its start to 1 at its end. */
  readonly t: number;
  readonly kind: Segment['kind'];
}

/**
 * The segment nearest to `at` (screen coordinates) within `radius` screen pixels, or null.
 * `view` maps model coordinates to screen coordinates; t is the same in both.
 */
export const hitTestSegment = (
  path: Path,
  at: Vec2,
  view: Affine,
  radius: number,
): SegmentHit | null => {
  let best: SegmentHit | null = null;
  let bestDistance = radius;
  for (const c of path.contours) {
    contourSegments(c).forEach((s, segmentIndex) => {
      const nearest = nearestPoint(
        mapPoints(s.segment, (p) => apply(view, p)),
        at,
      );
      if (nearest.distance <= bestDistance) {
        best = { contourId: c.id, segmentIndex, run: s.run, t: nearest.t, kind: s.segment.kind };
        bestDistance = nearest.distance;
      }
    });
  }
  return best;
};
