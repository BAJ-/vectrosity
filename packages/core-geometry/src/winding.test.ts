import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { containsPoint, isInsideByRule, windingNumber } from './winding';
import { signedArea } from './area';
import { line } from './segment';
import { vec2, type Vec2 } from './vec';
import { point } from './testing/arbitraries';

const square = (x: number, y: number, size: number): Vec2[] => [
  vec2(x, y),
  vec2(x + size, y),
  vec2(x + size, y + size),
  vec2(x, y + size),
];

const polygonArea = (polygon: Vec2[]): number =>
  signedArea(polygon.map((a, i) => line(a, polygon.at((i + 1) % polygon.length) ?? a)));

describe('windingNumber', () => {
  it('is +1 inside a counter-clockwise square and 0 outside', () => {
    const s = square(0, 0, 10);
    expect(windingNumber(s, vec2(5, 5))).toBe(1);
    expect(windingNumber(s, vec2(15, 5))).toBe(0);
    expect(windingNumber(s, vec2(5, -1))).toBe(0);
  });

  it('is -1 inside a clockwise square', () => {
    expect(windingNumber(square(0, 0, 10).reverse(), vec2(5, 5))).toBe(-1);
  });

  it('has the same sign as the signed area', () => {
    fc.assert(
      fc.property(point, point, point, (a, b, c) => {
        const triangle = [a, b, c];
        const area = polygonArea(triangle);
        fc.pre(Math.abs(area) > 1);
        const centroid = vec2((a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3);
        expect(windingNumber(triangle, centroid)).toBe(Math.sign(area));
      }),
    );
  });
});

describe('containsPoint', () => {
  const outer = square(0, 0, 30);
  const sameDirection = square(10, 10, 10);
  const hole = square(10, 10, 10).reverse();

  it('treats a nested contour in the same direction as filled under nonzero', () => {
    expect(containsPoint([outer, sameDirection], vec2(15, 15), 'nonzero')).toBe(true);
    expect(containsPoint([outer, sameDirection], vec2(15, 15), 'evenodd')).toBe(false);
  });

  it('treats a reversed inner contour as a hole under both rules', () => {
    expect(containsPoint([outer, hole], vec2(15, 15), 'nonzero')).toBe(false);
    expect(containsPoint([outer, hole], vec2(15, 15), 'evenodd')).toBe(false);
    expect(containsPoint([outer, hole], vec2(5, 5), 'nonzero')).toBe(true);
  });

  it('applies the rules to raw winding numbers', () => {
    expect(isInsideByRule(2, 'nonzero')).toBe(true);
    expect(isInsideByRule(2, 'evenodd')).toBe(false);
    expect(isInsideByRule(-1, 'evenodd')).toBe(true);
    expect(isInsideByRule(0, 'nonzero')).toBe(false);
  });
});
