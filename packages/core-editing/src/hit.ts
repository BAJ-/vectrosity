import { apply, distance, type Affine, type Vec2 } from '@vcore/geometry';
import type { Path, Point } from '@vcore/path';

/**
 * The point nearest to `at` (screen coordinates) within `radius` screen pixels, or null.
 * `view` maps model coordinates to screen coordinates.
 */
export const hitTestPoint = (path: Path, at: Vec2, view: Affine, radius: number): Point | null => {
  let best: Point | null = null;
  let bestDistance = radius;
  for (const c of path.contours) {
    for (const p of c.points) {
      const d = distance(apply(view, p), at);
      if (d <= bestDistance) {
        best = p;
        bestDistance = d;
      }
    }
  }
  return best;
};
