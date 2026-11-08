import { describe, expect, it } from 'vitest';
import { cubic, line, vec2 } from '@vcore/geometry';
import { curveToLine, lineToCurve } from './edit';
import { counterIds } from './ids';
import { validateContour } from './model';
import { toSegments } from './segments';
import { fromSvgPath } from './svg';

const contour = (d: string) => {
  const c = fromSvgPath(d, counterIds('s')).contours[0];
  if (!c) throw new Error('no contour');
  return c;
};

describe('lineToCurve', () => {
  it('turns a line into a cubic along the same line', () => {
    const c = lineToCurve(contour('M0 0 L30 0'), 0, counterIds('n'));
    expect(validateContour(c)).toEqual([]);
    expect(toSegments(c)).toEqual([cubic(vec2(0, 0), vec2(10, 0), vec2(20, 0), vec2(30, 0))]);
  });

  it('works on the closing run of a closed contour', () => {
    // The last run goes from (0,30) back to the first point (0,0).
    const c = lineToCurve(contour('M0 0 L30 0 L0 30 Z'), 2, counterIds('n'));
    expect(validateContour(c)).toEqual([]);
    expect(toSegments(c).at(2)).toEqual(cubic(vec2(0, 30), vec2(0, 20), vec2(0, 10), vec2(0, 0)));
  });

  it('leaves curves alone', () => {
    const c = contour('M0 0 C0 10 10 20 20 20');
    expect(lineToCurve(c, 0, counterIds('n'))).toBe(c);
  });
});

describe('curveToLine', () => {
  it('removes the handles and makes the run a line', () => {
    const c = curveToLine(contour('M0 0 C0 10 10 20 20 20'), 0);
    expect(validateContour(c)).toEqual([]);
    expect(toSegments(c)).toEqual([line(vec2(0, 0), vec2(20, 20))]);
  });

  it('undoes lineToCurve, keeping the original ids', () => {
    const start = contour('M0 0 L30 0 L0 30 Z');
    expect(curveToLine(lineToCurve(start, 1, counterIds('n')), 1)).toEqual(start);
  });
});
