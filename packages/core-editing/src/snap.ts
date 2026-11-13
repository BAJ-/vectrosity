import { vec2, type Vec2 } from '@vcore/geometry';

/**
 * Lines to snap to, in model units: vertical lines at the given x values and horizontal lines
 * at the given y values. The app supplies them (metric lines in a font, bounds or a grid in a
 * drawing).
 */
export interface SnapTargets {
  readonly xs: readonly number[];
  readonly ys: readonly number[];
}

export interface SnapResult {
  /** The move to make instead, with each axis pulled onto a line when one was close enough. */
  readonly delta: Vec2;
  /** The vertical line snapped to, or null. */
  readonly x: number | null;
  /** The horizontal line snapped to, or null. */
  readonly y: number | null;
}

/** The smallest correction that puts one of `values` on one of `lines`, within `tolerance`. */
const closest = (
  values: readonly number[],
  lines: readonly number[],
  tolerance: number,
): { line: number; correction: number } | null => {
  let best: { line: number; correction: number } | null = null;
  for (const v of values) {
    for (const line of lines) {
      const correction = line - v;
      if (
        Math.abs(correction) <= tolerance &&
        (!best || Math.abs(correction) < Math.abs(best.correction))
      ) {
        best = { line, correction };
      }
    }
  }
  return best;
};

/**
 * Adjusts a move so that a moving point lands on a snap line when it would come within
 * `tolerance` (model units) of one. `points` are where the moving points are before the move.
 * Each axis snaps on its own, to whichever point and line are closest.
 */
export const snapDelta = (
  points: readonly Vec2[],
  delta: Vec2,
  targets: SnapTargets,
  tolerance: number,
): SnapResult => {
  const x = closest(
    points.map((p) => p.x + delta.x),
    targets.xs,
    tolerance,
  );
  const y = closest(
    points.map((p) => p.y + delta.y),
    targets.ys,
    tolerance,
  );
  return {
    delta: vec2(delta.x + (x?.correction ?? 0), delta.y + (y?.correction ?? 0)),
    x: x?.line ?? null,
    y: y?.line ?? null,
  };
};
