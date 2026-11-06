import { isClosed, isOnCurve, type Contour, type Point, type PointType } from './model';

/**
 * A run is the stretch of a contour from one on-curve point to the next: the start point,
 * the off-curve points between, and the end point, whose type says how they are joined.
 * Indices point into contour.points.
 */
export interface Run {
  readonly start: number;
  readonly offs: readonly number[];
  readonly end: number;
  readonly type: PointType;
}

/** Throws if the index is outside the list; used where the index is known to be valid. */
export const pointAt = (c: Contour, index: number): Point => {
  const p = c.points.at(index);
  if (!p) throw new RangeError(`contour ${c.id} has no point at index ${index}`);
  return p;
};

/**
 * The runs of a contour, in order. For a closed contour the last run ends back at the
 * first on-curve point. Assumes the contour is valid (see validateContour).
 */
export const contourRuns = (c: Contour): Run[] => {
  const n = c.points.length;
  const onIndices = c.points.flatMap((p, i) => (isOnCurve(p) ? [i] : []));
  if (onIndices.length === 0) return [];
  const runs: Run[] = [];
  const closed = isClosed(c);
  const count = closed ? onIndices.length : onIndices.length - 1;
  for (let k = 0; k < count; k++) {
    const start = onIndices.at(k) ?? 0;
    const end = onIndices.at((k + 1) % onIndices.length) ?? 0;
    const offs: number[] = [];
    for (let i = (start + 1) % n; i !== end; i = (i + 1) % n) offs.push(i);
    runs.push({ start, offs, end, type: pointAt(c, end).type });
  }
  return runs;
};
