import { describe, expect, it } from 'vitest';
import { counterIds } from './ids';
import { booleanOp, removeOverlap, type BooleanOptions } from './boolean';
import { contourArea, correctDirections } from './direction';
import { isOnCurve, validatePath, type Path } from './model';
import { fromSvgPath } from './svg';
import { sourceSerif4 } from './testing/fixtures';

const options = (): BooleanOptions => ({
  fillRule: 'nonzero',
  outer: 'counterclockwise',
  ids: counterIds('r'),
});
const load = (d: string): Path => fromSvgPath(d, counterIds());
/** Total signed area: outer contours count positive, holes negative. */
const area = (path: Path): number => path.contours.reduce((sum, c) => sum + contourArea(c), 0);
const anchors = (path: Path): number =>
  path.contours.reduce((n, c) => n + c.points.filter(isOnCurve).length, 0);

// Two 10 x 10 squares, the second moved 5 right and 5 up: they overlap in a 5 x 5 square.
const a = load('M0 0 L10 0 L10 10 L0 10 Z');
const b = load('M5 5 L15 5 L15 15 L5 15 Z');

describe('booleanOp', () => {
  it('unions, subtracts, intersects and excludes two squares', () => {
    // Areas: 100 + 100 - 25 = 175; 100 - 25 = 75; 25; 175 - 25 = 150.
    const expected = { union: 175, subtract: 75, intersect: 25, exclude: 150 } as const;
    for (const [op, want] of Object.entries(expected)) {
      const result = booleanOp(a, b, op as keyof typeof expected, options());
      expect(validatePath(result)).toEqual([]);
      expect(area(result)).toBeCloseTo(want, 9);
    }
  });

  it('gives the union as one counter-clockwise contour with eight corners', () => {
    const union = booleanOp(a, b, 'union', options());
    expect(union.contours).toHaveLength(1);
    expect(contourArea(union.contours[0] ?? { id: '', points: [] })).toBeGreaterThan(0);
    expect(anchors(union)).toBe(8);
  });

  it('handles curves: a glyph intersected with itself is unchanged, minus itself is empty', () => {
    const o = correctDirections(load(sourceSerif4().glyphs['o']?.d ?? ''), 'counterclockwise', 0.1);
    const same = booleanOp(o, o, 'intersect', options());
    expect(same.contours).toHaveLength(2);
    expect(area(same)).toBeCloseTo(area(o), 6);
    expect(booleanOp(o, o, 'subtract', options()).contours).toEqual([]);
  });

  it('runs outer contours the way asked, and holes the other way', () => {
    const ring = load('M0 0 L30 0 L30 30 L0 30 Z M10 10 L10 20 L20 20 L20 10 Z');
    const cw = removeOverlap(ring, { ...options(), outer: 'clockwise' });
    expect(cw.contours.map(contourArea).sort((x, y) => x - y)).toEqual([-900, 100]);
  });

  it('merges squares that only share an edge, and identical squares', () => {
    const side = load('M10 0 L20 0 L20 10 L10 10 Z');
    const merged = booleanOp(a, side, 'union', options());
    expect(merged.contours).toHaveLength(1);
    expect(area(merged)).toBeCloseTo(200, 9);
    const same = booleanOp(a, a, 'union', options());
    expect(same.contours).toHaveLength(1);
    expect(area(same)).toBeCloseTo(100, 9);
  });
});

describe('removeOverlap', () => {
  it('merges overlapping strokes into one outline', () => {
    // A plus sign drawn as two overlapping bars: 300 + 300 - 100 = 500, with 12 corners.
    const plus = load('M0 10 L30 10 L30 20 L0 20 Z M10 0 L20 0 L20 30 L10 30 Z');
    const merged = removeOverlap(plus, options());
    expect(merged.contours).toHaveLength(1);
    expect(area(merged)).toBeCloseTo(500, 9);
    expect(anchors(merged)).toBe(12);
  });

  it('keeps a hole as a hole, running the other way', () => {
    const ring = load('M0 0 L30 0 L30 30 L0 30 Z M10 10 L10 20 L20 20 L20 10 Z');
    const result = removeOverlap(ring, options());
    expect(result.contours.map(contourArea).sort((x, y) => x - y)).toEqual([-100, 900]);
  });

  it('leaves every fixture glyph with the same area and contours', () => {
    const font = sourceSerif4();
    for (const [name, glyph] of Object.entries(font.glyphs)) {
      const source = correctDirections(load(glyph.d), 'counterclockwise', 0.1);
      const result = removeOverlap(source, options());
      expect(validatePath(result), name).toEqual([]);
      expect(result.contours.length, name).toBe(source.contours.length);
      expect(area(result), name).toBeCloseTo(area(source), 6);
    }
  });
});
