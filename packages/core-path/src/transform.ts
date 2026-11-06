import { apply, determinant, type Affine } from '@vcore/geometry';
import type { Contour, Path } from './model';

/**
 * Applies an affine transform to every point. Structure-preserving.
 * A mirroring transform (negative determinant) reverses every contour's direction;
 * call correctDirections afterwards if direction matters.
 */
export const transformContour = (c: Contour, m: Affine): Contour => ({
  ...c,
  points: c.points.map((p) => ({ ...p, ...apply(m, p) })),
});

export const transformPath = (path: Path, m: Affine): Path => ({
  contours: path.contours.map((c) => transformContour(c, m)),
});

/** True when the transform mirrors, and so flips contour directions. */
export const isMirroring = (m: Affine): boolean => determinant(m) < 0;
