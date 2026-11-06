import { cross, sub, type Vec2 } from './vec';

/** How overlapping contours decide what is inside. */
export type FillRule = 'nonzero' | 'evenodd';

/**
 * The winding number of `p` around a closed polygon (the last point joins back to the first).
 * Counter-clockwise loops in a y-up frame count +1, matching the sign of signedArea.
 * Points exactly on an edge may count either way.
 */
export const windingNumber = (polygon: readonly Vec2[], p: Vec2): number => {
  let winding = 0;
  const count = polygon.length;
  for (let i = 0; i < count; i++) {
    const a = polygon.at(i);
    const b = polygon.at((i + 1) % count);
    if (!a || !b) continue;
    const side = cross(sub(b, a), sub(p, a));
    if (a.y <= p.y) {
      if (b.y > p.y && side > 0) winding += 1;
    } else if (b.y <= p.y && side < 0) {
      winding -= 1;
    }
  }
  return winding;
};

export const isInsideByRule = (winding: number, rule: FillRule): boolean =>
  rule === 'nonzero' ? winding !== 0 : Math.abs(winding) % 2 === 1;

/** Whether `p` is inside a shape made of several closed polygons, under the given fill rule. */
export const containsPoint = (
  polygons: readonly (readonly Vec2[])[],
  p: Vec2,
  rule: FillRule,
): boolean =>
  isInsideByRule(
    polygons.reduce((sum, polygon) => sum + windingNumber(polygon, p), 0),
    rule,
  );
