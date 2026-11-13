import { describe, expect, it } from 'vitest';
import { vec2 } from '@vcore/geometry';
import { snapDelta } from './snap';

describe('snapDelta', () => {
  const targets = { xs: [0, 500], ys: [0, 475] };

  it('pulls a point onto a line within the tolerance', () => {
    // (100, 3) moved by (10, 0) is at y 3, 3 units above the baseline: snap down by 3.
    expect(snapDelta([vec2(100, 3)], vec2(10, 0), targets, 5)).toEqual({
      delta: vec2(10, -3),
      x: null,
      y: 0,
    });
  });

  it('snaps each axis on its own', () => {
    // (496, 470) moved by (0, 1) is 4 from x 500 and 4 from y 475.
    expect(snapDelta([vec2(496, 470)], vec2(0, 1), targets, 5)).toEqual({
      delta: vec2(4, 5),
      x: 500,
      y: 475,
    });
  });

  it('uses whichever moving point is closest to a line', () => {
    // After the move the points are at y 8 and y 472: 472 is 3 from 475, 8 is 8 from 0.
    const result = snapDelta([vec2(0, 10), vec2(0, 474)], vec2(50, -2), targets, 5);
    expect(result.y).toBe(475);
    expect(result.delta.y).toBe(1);
  });

  it('leaves the move alone when nothing is close enough', () => {
    expect(snapDelta([vec2(100, 100)], vec2(1, 1), targets, 5)).toEqual({
      delta: vec2(1, 1),
      x: null,
      y: null,
    });
  });
});
