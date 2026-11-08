import { describe, expect, it } from 'vitest';
import { scaling, vec2 } from '@vcore/geometry';
import { counterIds, fromSvgPath } from '@vcore/path';
import { hitTestPoint } from './hit';

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
