import { apply, distance, type Affine, type Vec2 } from '@vcore/geometry';
import { isOnCurve, type Path, type Point } from '@vcore/path';

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
