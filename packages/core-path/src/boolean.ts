import {
  cubic,
  endPoint,
  line,
  quad,
  vec2,
  type FillRule,
  type Segment,
  type Vec2,
} from '@vcore/geometry';
import {
  FillRule as LibraryFillRule,
  PathBoolean,
  PathBooleanOperation,
  type Path as LibraryPath,
} from 'path-bool';
import type { OuterDirection } from './direction';
import { reverseContour } from './edit';
import type { IdGenerator } from './ids';
import type { Path } from './model';
import { contourFromSegments, toSegments } from './segments';

// The boolean operations are the core's one runtime dependency, PathBool.js (MIT), kept behind
// these two functions so it can be swapped without touching callers.

export type BooleanOperation = 'union' | 'subtract' | 'intersect' | 'exclude';

export interface BooleanOptions {
  /** How each input decides what is inside it. */
  readonly fillRule: FillRule;
  /** Which way outer contours of the result run; holes run the other way. */
  readonly outer: OuterDirection;
  /** Ids for the result's contours and points; every result point is new. */
  readonly ids: IdGenerator;
}

type LibraryPoint = [number, number];

const toLibraryPoint = (p: Vec2): LibraryPoint => [p.x, p.y];
const fromLibraryPoint = ([x, y]: readonly number[]): Vec2 => vec2(x ?? 0, y ?? 0);

/** Our path as the library's flat list of segments. Open contours are closed with a line. */
const toLibrary = (path: Path): LibraryPath =>
  path.contours.flatMap((c) => {
    const segments = toSegments(c);
    const first = segments.at(0);
    const last = segments.at(-1);
    if (!first || !last) return [];
    const end = endPoint(last);
    const gap = end.x !== first.p0.x || end.y !== first.p0.y;
    const closed = gap ? [...segments, line(end, first.p0)] : segments;
    return closed.map((s): LibraryPath[number] =>
      s.kind === 'line'
        ? ['L', toLibraryPoint(s.p0), toLibraryPoint(s.p1)]
        : s.kind === 'quad'
          ? ['Q', toLibraryPoint(s.p0), toLibraryPoint(s.p1), toLibraryPoint(s.p2)]
          : [
              'C',
              toLibraryPoint(s.p0),
              toLibraryPoint(s.p1),
              toLibraryPoint(s.p2),
              toLibraryPoint(s.p3),
            ],
    );
  });

const withEnd = (s: Segment, end: Vec2): Segment =>
  s.kind === 'line'
    ? line(s.p0, end)
    : s.kind === 'quad'
      ? quad(s.p0, s.p1, end)
      : cubic(s.p0, s.p1, s.p2, end);

const fromLibrarySegment = (s: LibraryPath[number]): Segment => {
  if (s[0] === 'L') return line(fromLibraryPoint(s[1]), fromLibraryPoint(s[2]));
  if (s[0] === 'Q') {
    return quad(fromLibraryPoint(s[1]), fromLibraryPoint(s[2]), fromLibraryPoint(s[3]));
  }
  if (s[0] === 'C') {
    const [, p0, p1, p2, p3] = s;
    return cubic(
      fromLibraryPoint(p0),
      fromLibraryPoint(p1),
      fromLibraryPoint(p2),
      fromLibraryPoint(p3),
    );
  }
  throw new Error('boolean result has an arc, which no input had');
};

/**
 * The library's result back as our path. Its segments come as closed loops one after another:
 * a loop ends when a segment ends where the loop started. Intersection points can differ in
 * the last few bits (10.000000000000002 against 10), so "where" allows a gap of 1e-9 of the
 * result's size, and the loop's last point is then set exactly onto its first.
 *
 * The library makes outer contours clockwise (y-up) and holes counter-clockwise, whatever
 * the input; the tests check this. So for counter-clockwise outers every contour is reversed.
 * This is more reliable than correctDirections, whose inside test is unsure for contours that
 * touch, as boolean results often do.
 */
const fromLibrary = (result: readonly LibraryPath[], options: BooleanOptions): Path => {
  const segments = result.flat().map(fromLibrarySegment);
  const extent = Math.max(1, ...segments.flatMap((s) => [Math.abs(s.p0.x), Math.abs(s.p0.y)]));
  const gap = 1e-9 * extent;
  const loops: Segment[][] = [];
  let loop: Segment[] = [];
  for (const segment of segments) {
    const start = loop[0]?.p0 ?? segment.p0;
    const end = endPoint(segment);
    if (Math.abs(end.x - start.x) <= gap && Math.abs(end.y - start.y) <= gap) {
      loops.push([...loop, withEnd(segment, start)]);
      loop = [];
    } else {
      loop.push(segment);
    }
  }
  if (loop.length > 0) throw new Error('boolean result has a loop that does not close');
  const contours = loops.map((l) => contourFromSegments(l, true, options.ids));
  return { contours: options.outer === 'clockwise' ? contours : contours.map(reverseContour) };
};

const OPERATIONS: Record<BooleanOperation, PathBooleanOperation> = {
  union: PathBooleanOperation.Union,
  subtract: PathBooleanOperation.Difference,
  intersect: PathBooleanOperation.Intersection,
  exclude: PathBooleanOperation.Exclusion,
};

const libraryRule = (rule: FillRule): LibraryFillRule =>
  rule === 'nonzero' ? LibraryFillRule.NonZero : LibraryFillRule.EvenOdd;

/**
 * Combines two paths: union, `a` minus `b`, their overlap, or everything but their overlap.
 * Open contours are treated as closed by a straight line. Structure-changing: every point of
 * the result is new, and its contours run as `options.outer` says.
 */
export const booleanOp = (
  a: Path,
  b: Path,
  op: BooleanOperation,
  options: BooleanOptions,
): Path => {
  const rule = libraryRule(options.fillRule);
  const result = new PathBoolean([
    { path: toLibrary(a), fillRule: rule },
    { path: toLibrary(b), fillRule: rule },
  ]).get(OPERATIONS[op]);
  return fromLibrary(result, options);
};

/**
 * Merges the overlapping parts of a path's own contours, so no area is covered twice: what a
 * font needs at export. Structure-changing, like booleanOp.
 */
export const removeOverlap = (path: Path, options: BooleanOptions): Path =>
  booleanOp(path, { contours: [] }, 'union', options);
