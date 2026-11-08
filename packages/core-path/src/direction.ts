import { flatten, signedArea, windingNumber, vec2 } from '@vcore/geometry';
import { reverseContour } from './edit';
import { isClosed, isOnCurve, type Contour, type Path } from './model';
import { toSegments } from './segments';

/** Which way outer contours run, in a y-up frame. Holes run the other way. */
export type OuterDirection = 'counterclockwise' | 'clockwise';

/** Signed area of a closed contour: positive when it runs counter-clockwise in a y-up frame. */
export const contourArea = (c: Contour): number => signedArea(toSegments(c));

/**
 * Reverses contours so outer contours run in `outer` direction and holes run the other way.
 * A contour is a hole when it sits inside an odd number of other contours. `tolerance`
 * (model units) is used to flatten contours for the inside test.
 * Open and zero-area contours are left alone. Assumes contours do not overlap each other
 * (remove overlap first); overlapping contours have no well-defined nesting.
 * Structure-preserving: only reverses whole contours.
 */
export const correctDirections = (path: Path, outer: OuterDirection, tolerance: number): Path => {
  const closed = path.contours.filter(isClosed);
  const polygons = new Map(closed.map((c) => [c.id, flatten(toSegments(c), tolerance)]));
  const outerSign = outer === 'counterclockwise' ? 1 : -1;
  return {
    contours: path.contours.map((c) => {
      if (!isClosed(c)) return c;
      const area = contourArea(c);
      if (area === 0) return c;
      const probe = c.points.find(isOnCurve);
      if (!probe) return c;
      const at = vec2(probe.x, probe.y);
      const depth = closed.filter(
        (other) => other.id !== c.id && windingNumber(polygons.get(other.id) ?? [], at) !== 0,
      ).length;
      const wanted = depth % 2 === 0 ? outerSign : -outerSign;
      return Math.sign(area) === wanted ? c : reverseContour(c);
    }),
  };
};
