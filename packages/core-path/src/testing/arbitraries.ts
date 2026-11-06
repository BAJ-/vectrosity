import fc from 'fast-check';
import { cubic, endPoint, line, quad, type Segment, type Vec2 } from '@vcore/geometry';
import { point } from '@vcore/geometry/testing';
import { counterIds } from '../ids';
import type { Contour, Point } from '../model';
import { contourFromSegments } from '../segments';

/** A chain of 1 to 6 segments, each starting where the previous one ends. */
export const segmentChainArb: fc.Arbitrary<Segment[]> = fc
  .tuple(
    point,
    fc.array(
      fc.oneof(
        fc.tuple(fc.constant('line' as const), point),
        fc.tuple(fc.constant('quad' as const), point, point),
        fc.tuple(fc.constant('cubic' as const), point, point, point),
      ),
      { minLength: 1, maxLength: 6 },
    ),
  )
  .map(([start, specs]) => {
    const segments: Segment[] = [];
    let from: Vec2 = start;
    for (const spec of specs) {
      const s =
        spec[0] === 'line'
          ? line(from, spec[1])
          : spec[0] === 'quad'
            ? quad(from, spec[1], spec[2])
            : cubic(from, spec[1], spec[2], spec[3]);
      segments.push(s);
      from = endPoint(s);
    }
    return segments;
  });

/** Open and closed contours built from segment chains, with IDs c1, c2, ... */
export const contourArb: fc.Arbitrary<Contour> = fc
  .tuple(segmentChainArb, fc.boolean())
  .map(([segments, closed]) => contourFromSegments(segments, closed, counterIds('c')));

/**
 * Closed TrueType-style contours: on-curve points with runs of 0 to 3 off-curve points,
 * so 'qcurve' runs with implied on-curve points between their off-curve points.
 */
export const qcurveContourArb: fc.Arbitrary<Contour> = fc
  .array(fc.tuple(point, fc.array(point, { maxLength: 3 })), { minLength: 1, maxLength: 4 })
  .map((runs) => {
    const ids = counterIds('q');
    const points: Point[] = [];
    for (const [on, offs] of runs) {
      for (const o of offs) points.push({ id: ids(), x: o.x, y: o.y, type: 'offcurve' });
      points.push({ id: ids(), x: on.x, y: on.y, type: offs.length > 0 ? 'qcurve' : 'line' });
    }
    return { id: ids(), points };
  });
