import type { Vec2 } from '@vcore/geometry';

/**
 * Point types follow the UFO font format. An on-curve point's type describes the segment
 * that arrives at it from the previous on-curve point:
 * - 'move': first point of an open contour (nothing arrives at it)
 * - 'line': a straight line
 * - 'curve': a cubic curve through the off-curve points before it (0 = line, 1 = quadratic, 2 = cubic)
 * - 'qcurve': a TrueType-style quadratic spline through any number of off-curve points
 * - 'offcurve': a control point (handle), not on the outline
 */
export type PointType = 'move' | 'line' | 'curve' | 'qcurve' | 'offcurve';

export interface Point extends Vec2 {
  readonly id: string;
  readonly type: PointType;
  /** Only meaningful on on-curve points: the outline must stay smooth (no corner) here. */
  readonly smooth?: boolean;
}

/**
 * A contour is open when its first point is a 'move' point, and closed otherwise.
 * A closed contour is a cyclic list: the point after the last is the first.
 */
export interface Contour {
  readonly id: string;
  readonly points: readonly Point[];
}

export interface Path {
  readonly contours: readonly Contour[];
}

export const emptyPath = (): Path => ({ contours: [] });

export const isOnCurve = (p: Point): boolean => p.type !== 'offcurve';

export const isClosed = (c: Contour): boolean => c.points.at(0)?.type !== 'move';

/** Every problem that makes the contour unusable; an empty list means it is valid. */
export const validateContour = (c: Contour): string[] => {
  const problems: string[] = [];
  const pts = c.points;
  if (pts.length === 0) return [`contour ${c.id}: has no points`];
  if (!pts.some(isOnCurve)) problems.push(`contour ${c.id}: has no on-curve points`);
  pts.forEach((p, i) => {
    if (p.type === 'move' && i !== 0) {
      problems.push(`contour ${c.id}: 'move' point ${p.id} is not the first point`);
    }
    if (p.type === 'offcurve' && p.smooth) {
      problems.push(`contour ${c.id}: off-curve point ${p.id} is marked smooth`);
    }
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      problems.push(`contour ${c.id}: point ${p.id} has a coordinate that is not a finite number`);
    }
  });
  // Count the off-curve points before each on-curve point (cyclically for closed contours).
  const closed = isClosed(c);
  const firstOn = pts.findIndex(isOnCurve);
  if (firstOn >= 0) {
    let offs = 0;
    const n = pts.length;
    const start = closed ? firstOn + 1 : 0;
    for (let k = 0; k < n; k++) {
      const p = pts.at((start + k) % n);
      if (!p) continue;
      if (p.type === 'offcurve') {
        offs++;
        continue;
      }
      if (p.type === 'line' && offs > 0) {
        problems.push(`contour ${c.id}: 'line' point ${p.id} has off-curve points before it`);
      }
      if (p.type === 'curve' && offs > 2) {
        problems.push(`contour ${c.id}: 'curve' point ${p.id} has more than 2 off-curve points`);
      }
      offs = 0;
    }
    if (!closed && offs > 0) {
      problems.push(`contour ${c.id}: open contour ends with off-curve points`);
    }
  }
  return problems;
};

/** Every problem in the path, including point or contour IDs used more than once. */
export const validatePath = (path: Path): string[] => {
  const problems = path.contours.flatMap(validateContour);
  const seen = new Set<string>();
  for (const c of path.contours) {
    for (const id of [c.id, ...c.points.map((p) => p.id)]) {
      if (seen.has(id)) problems.push(`id ${id} is used more than once`);
      seen.add(id);
    }
  }
  return problems;
};
