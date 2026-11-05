import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { add, vec2 } from './index';

const finite = fc.double({ noNaN: true, noDefaultInfinity: true, min: -1e6, max: 1e6 });
const point = fc.record({ x: finite, y: finite });

describe('add', () => {
  it('adds component-wise', () => {
    expect(add(vec2(1, 2), vec2(3, 4))).toEqual(vec2(4, 6));
  });

  it('is commutative', () => {
    fc.assert(fc.property(point, point, (a, b) => {
      expect(add(a, b)).toEqual(add(b, a));
    }));
  });
});
