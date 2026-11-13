import { describe, expect, it } from 'vitest';
import { scaling, vec2 } from '@vcore/geometry';
import { counterIds, fromSvgPath } from '@vcore/path';
import { hitTestPoint, hitTestSegment, pointsInRect } from './hit';

describe('hitTestPoint', () => {
  // At 2x zoom the points (0,0) and (10,0) are at screen (0,0) and (20,0).
  const path = fromSvgPath('M0 0 L10 0 L10 10 Z', counterIds());
  const view = scaling(2);

  it('finds the nearest point within the radius, in screen pixels', () => {
    expect(hitTestPoint(path, vec2(18, 1), view, 5)?.x).toBe(10);
    expect(hitTestPoint(path, vec2(3, 0), view, 5)?.x).toBe(0);
  });

  it('finds nothing outside the radius', () => {
    expect(hitTestPoint(path, vec2(10, 0), view, 5)).toBeNull();
  });

  it('prefers the anchor when a handle sits on top of it', () => {
    // The incoming handle (10,0) of the anchor at (10,0) comes before the anchor in the list.
    const stacked = fromSvgPath('M0 0 C5 0 10 0 10 0', counterIds());
    expect(hitTestPoint(stacked, vec2(20, 0), view, 5)?.type).toBe('curve');
  });
});

describe('pointsInRect', () => {
  const path = fromSvgPath('M0 0 L10 0 L10 10 Z', counterIds());
  const view = scaling(2);

  it('finds the points inside, in screen pixels, whichever way the rectangle was drawn', () => {
    // Screen (-1,-1) to (21,1) covers model (0,0) and (10,0), not (10,10).
    const xs = (a: [number, number], b: [number, number]) =>
      pointsInRect(path, vec2(...a), vec2(...b), view).map((p) => [p.x, p.y]);
    expect(xs([-1, -1], [21, 1])).toEqual([
      [0, 0],
      [10, 0],
    ]);
    expect(xs([21, 1], [-1, -1])).toEqual(xs([-1, -1], [21, 1]));
    expect(xs([30, 30], [40, 40])).toEqual([]);
  });
});

describe('hitTestSegment', () => {
  // At 2x zoom the line (0,0)-(10,0) runs from screen (0,0) to (20,0).
  const path = fromSvgPath('M0 0 L10 0 C10 10 0 10 0 0 Z', counterIds());
  const view = scaling(2);

  it('finds the segment and the position along it, in screen pixels', () => {
    const hit = hitTestSegment(path, vec2(10, -3), view, 5);
    expect(hit).toMatchObject({ segmentIndex: 0, run: 0, kind: 'line' });
    expect(hit?.t).toBeCloseTo(0.5, 9);
  });

  it('finds curves too', () => {
    // The cubic's middle is model (5, 7.5), screen (10, 15).
    const hit = hitTestSegment(path, vec2(10, 16), view, 5);
    expect(hit).toMatchObject({ segmentIndex: 1, kind: 'cubic' });
    expect(hit?.t).toBeCloseTo(0.5, 6);
  });

  it('finds nothing outside the radius', () => {
    expect(hitTestSegment(path, vec2(10, -20), view, 5)).toBeNull();
  });
});
