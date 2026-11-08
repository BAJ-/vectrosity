import { describe, expect, it } from 'vitest';
import { counterIds } from './ids';
import { fromSvgPath } from './svg';
import { detectSmoothPoints } from './smooth';

const smoothFlags = (d: string) =>
  detectSmoothPoints(fromSvgPath(d, counterIds()), 0.01).contours.flatMap((c) =>
    c.points.map((p) => [p.type, p.x, p.y, p.smooth === true]),
  );

describe('detectSmoothPoints', () => {
  it('marks a point smooth when its neighbours are in line with it', () => {
    // Two cubics meeting at (20,20) with handles (10,20) and (30,20): smooth.
    const flags = smoothFlags('M0 0 C0 10 10 20 20 20 C30 20 40 10 40 0');
    expect(flags.find(([, x, y]) => x === 20 && y === 20)).toEqual(['curve', 20, 20, true]);
  });

  it('leaves corners, off-curve points and open ends alone', () => {
    const flags = smoothFlags('M0 0 L10 0 L10 10');
    expect(flags.every(([, , , smooth]) => smooth === false)).toBe(true);
    const curve = smoothFlags('M0 0 C0 10 10 20 20 20 C30 20 40 10 40 0');
    expect(curve.filter(([type]) => type === 'offcurve').every(([, , , s]) => s === false)).toBe(
      true,
    );
  });

  it('wraps around a closed contour', () => {
    // A circle-like loop of quadratics: every on-curve point is smooth, including the first.
    const flags = smoothFlags('M10 0 Q10 10 0 10 Q-10 10 -10 0 Q-10 -10 0 -10 Q10 -10 10 0 Z');
    expect(flags.filter(([type]) => type !== 'offcurve').every(([, , , s]) => s === true)).toBe(
      true,
    );
  });
});
