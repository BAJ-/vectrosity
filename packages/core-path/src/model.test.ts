import { describe, expect, it } from 'vitest';
import { isClosed, validateContour, validatePath, type Contour, type Point } from './model';

const p = (id: string, type: Point['type'], x = 0, y = 0, smooth?: boolean): Point =>
  smooth === undefined ? { id, x, y, type } : { id, x, y, type, smooth };
const contour = (points: Point[]): Contour => ({ id: 'c', points });

describe('validateContour', () => {
  it('accepts well-formed open and closed contours', () => {
    expect(validateContour(contour([p('a', 'move'), p('b', 'line')]))).toEqual([]);
    expect(
      validateContour(
        contour([p('a', 'curve', 0, 0, true), p('b', 'offcurve'), p('c', 'offcurve')]),
      ),
    ).toEqual([]);
    // A closed contour may start with an off-curve point.
    expect(
      validateContour(contour([p('a', 'offcurve'), p('b', 'qcurve'), p('c', 'line')])),
    ).toEqual([]);
  });

  it('reports each kind of problem', () => {
    expect(validateContour(contour([]))).toHaveLength(1);
    expect(validateContour(contour([p('a', 'offcurve'), p('b', 'offcurve')]))).toContain(
      'contour c: has no on-curve points',
    );
    expect(validateContour(contour([p('a', 'line'), p('b', 'move')]))[0]).toMatch(/not the first/);
    expect(validateContour(contour([p('a', 'line'), p('b', 'offcurve', 0, 0, true)]))[0]).toMatch(
      /marked smooth/,
    );
    expect(
      validateContour(contour([p('a', 'line'), p('b', 'offcurve'), p('c', 'line')]))[0],
    ).toMatch(/'line' point c has off-curve/);
    const tooMany = [p('a', 'line'), p('b', 'offcurve'), p('c', 'offcurve'), p('d', 'offcurve')];
    expect(validateContour(contour([...tooMany, p('e', 'curve')]))[0]).toMatch(/more than 2/);
    expect(validateContour(contour([p('a', 'move'), p('b', 'offcurve')]))[0]).toMatch(
      /ends with off-curve/,
    );
    expect(validateContour(contour([p('a', 'move', NaN), p('b', 'line')]))[0]).toMatch(/finite/);
  });

  it('counts the off-curve points that wrap around the end of a closed contour', () => {
    // b and c come before a, cyclically: 2 handles for a 'curve' point is fine, 3 is not.
    const ok = contour([p('a', 'curve'), p('x', 'line'), p('b', 'offcurve'), p('c', 'offcurve')]);
    expect(validateContour(ok)).toEqual([]);
    const bad = contour([
      p('d', 'offcurve'),
      p('a', 'curve'),
      p('x', 'line'),
      p('b', 'offcurve'),
      p('c', 'offcurve'),
    ]);
    expect(validateContour(bad)[0]).toMatch(/more than 2/);
  });
});

describe('validatePath', () => {
  it('reports IDs used more than once', () => {
    const a = contour([p('a', 'move'), p('b', 'line')]);
    const b = { id: 'd', points: [p('a', 'move'), p('e', 'line')] };
    expect(validatePath({ contours: [a, b] })).toEqual(['id a is used more than once']);
  });
});

describe('isClosed', () => {
  it('is false only when the first point is a move', () => {
    expect(isClosed(contour([p('a', 'move'), p('b', 'line')]))).toBe(false);
    expect(isClosed(contour([p('a', 'line'), p('b', 'line')]))).toBe(true);
  });
});
