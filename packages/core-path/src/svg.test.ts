import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { cubic, line, quad, vec2 } from '@vcore/geometry';
import { counterIds } from './ids';
import { isClosed } from './model';
import { toSegments } from './segments';
import { fromSvgPath, toSvgPath } from './svg';
import { contourArb } from './testing/arbitraries';

const parse = (d: string) => fromSvgPath(d, counterIds());
const segmentsOf = (d: string) => parse(d).contours.map(toSegments);

describe('fromSvgPath', () => {
  it('reads absolute and relative lines, including H, V and implicit linetos after M', () => {
    expect(segmentsOf('M0 0 10 0 V10 h-10 z')).toEqual([
      [
        line(vec2(0, 0), vec2(10, 0)),
        line(vec2(10, 0), vec2(10, 10)),
        line(vec2(10, 10), vec2(0, 10)),
        line(vec2(0, 10), vec2(0, 0)),
      ],
    ]);
    expect(segmentsOf('m5,5 l10,0')).toEqual([[line(vec2(5, 5), vec2(15, 5))]]);
  });

  it('reads curves and reflects the previous control point for S and T', () => {
    expect(segmentsOf('M0 0 C0 10 10 10 10 0 S20 -10 20 0')).toEqual([
      [
        cubic(vec2(0, 0), vec2(0, 10), vec2(10, 10), vec2(10, 0)),
        cubic(vec2(10, 0), vec2(10, -10), vec2(20, -10), vec2(20, 0)),
      ],
    ]);
    expect(segmentsOf('M0 0 Q5 10 10 0 T20 0')).toEqual([
      [quad(vec2(0, 0), vec2(5, 10), vec2(10, 0)), quad(vec2(10, 0), vec2(15, -10), vec2(20, 0))],
    ]);
    // S without a preceding cubic uses the current point as its first control point.
    expect(segmentsOf('M0 0 S10 10 20 0')).toEqual([
      [cubic(vec2(0, 0), vec2(0, 0), vec2(10, 10), vec2(20, 0))],
    ]);
  });

  it('reads compact number forms', () => {
    expect(segmentsOf('M.5-.5L1e1.25')).toEqual([[line(vec2(0.5, -0.5), vec2(10, 0.25))]]);
  });

  it('makes one contour per subpath, closed only when ended by Z', () => {
    const path = parse('M0 0 L10 0 L10 10 Z M20 0 L30 0');
    expect(path.contours.map(isClosed)).toEqual([true, false]);
  });

  it('starts a new subpath at the same point when drawing continues after Z', () => {
    expect(segmentsOf('M0 0 L10 0 L0 10 Z L-10 0')).toEqual([
      [
        line(vec2(0, 0), vec2(10, 0)),
        line(vec2(10, 0), vec2(0, 10)),
        line(vec2(0, 10), vec2(0, 0)),
      ],
      [line(vec2(0, 0), vec2(-10, 0))],
    ]);
  });

  it('rejects arcs and malformed data', () => {
    expect(() => parse('M0 0 A5 5 0 0 1 10 0')).toThrow(SyntaxError);
    expect(() => parse('M0 0 L10')).toThrow(SyntaxError);
    expect(() => parse('0 0 L10 10')).toThrow(SyntaxError);
    expect(() => parse('M0 0 X10 10')).toThrow(SyntaxError);
  });
});

describe('toSvgPath', () => {
  it('writes absolute commands', () => {
    expect(toSvgPath(parse('m0 0 l10 0 l0 10 z'))).toBe('M0 0 L10 0 L10 10 L0 0 Z');
  });

  it('round-trips through fromSvgPath with exactly the same outline', () => {
    fc.assert(
      fc.property(fc.array(contourArb, { minLength: 1, maxLength: 3 }), (contours) => {
        const back = parse(toSvgPath({ contours }));
        expect(back.contours.map(toSegments)).toEqual(contours.map(toSegments));
        expect(back.contours.map(isClosed)).toEqual(contours.map(isClosed));
      }),
    );
  });
});
