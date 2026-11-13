import { apply, cross, length, sub, vec2, type Affine, type Vec2 } from '@vcore/geometry';
import type { SnapTargets } from './snap';

/**
 * A guide line, in model units: vertical at x = position (axis 'x') or horizontal at
 * y = position (axis 'y'). The app decides what guides exist and whether they can move
 * (metric lines in a font, ruler guides in a drawing).
 */
export interface Guide {
  readonly id: string;
  readonly axis: 'x' | 'y';
  readonly position: number;
}

/** Distance in screen pixels from `at` to the guide's line as drawn through `view`. */
const screenDistance = (guide: Guide, at: Vec2, view: Affine): number => {
  const { axis, position } = guide;
  const a = apply(view, axis === 'x' ? vec2(position, 0) : vec2(0, position));
  const b = apply(view, axis === 'x' ? vec2(position, 1) : vec2(1, position));
  const along = sub(b, a);
  return Math.abs(cross(along, sub(at, a))) / length(along);
};

/**
 * The guide nearest to `at` (screen coordinates) within `radius` screen pixels, or null.
 * `view` maps model coordinates to screen coordinates.
 */
export const hitTestGuide = (
  guides: readonly Guide[],
  at: Vec2,
  view: Affine,
  radius: number,
): Guide | null => {
  let best: Guide | null = null;
  let bestDistance = radius;
  for (const guide of guides) {
    const d = screenDistance(guide, at, view);
    if (d <= bestDistance) {
      best = guide;
      bestDistance = d;
    }
  }
  return best;
};

/** The guides as lines to snap to. */
export const guideSnapTargets = (guides: readonly Guide[]): SnapTargets => ({
  xs: guides.filter((g) => g.axis === 'x').map((g) => g.position),
  ys: guides.filter((g) => g.axis === 'y').map((g) => g.position),
});
