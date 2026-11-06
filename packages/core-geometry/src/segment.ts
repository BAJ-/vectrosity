import { add, lerp, scale, sub, vec2, type Vec2 } from './vec';

export interface Line {
  readonly kind: 'line';
  readonly p0: Vec2;
  readonly p1: Vec2;
}
export interface Quad {
  readonly kind: 'quad';
  readonly p0: Vec2;
  readonly p1: Vec2;
  readonly p2: Vec2;
}
export interface Cubic {
  readonly kind: 'cubic';
  readonly p0: Vec2;
  readonly p1: Vec2;
  readonly p2: Vec2;
  readonly p3: Vec2;
}
/** One piece of a contour, from its start point to its end point, parameterised by t in [0, 1]. */
export type Segment = Line | Quad | Cubic;

export const line = (p0: Vec2, p1: Vec2): Line => ({ kind: 'line', p0, p1 });
export const quad = (p0: Vec2, p1: Vec2, p2: Vec2): Quad => ({ kind: 'quad', p0, p1, p2 });
export const cubic = (p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2): Cubic => ({
  kind: 'cubic',
  p0,
  p1,
  p2,
  p3,
});

/** The control points of a segment as a list, in order. */
export const controlPoints = (s: Segment): Vec2[] =>
  s.kind === 'line'
    ? [s.p0, s.p1]
    : s.kind === 'quad'
      ? [s.p0, s.p1, s.p2]
      : [s.p0, s.p1, s.p2, s.p3];

export const endPoint = (s: Segment): Vec2 =>
  s.kind === 'line' ? s.p1 : s.kind === 'quad' ? s.p2 : s.p3;

/** The point at parameter t (de Casteljau, numerically stable for t in [0, 1]). */
export const evaluate = (s: Segment, t: number): Vec2 => {
  switch (s.kind) {
    case 'line':
      return lerp(s.p0, s.p1, t);
    case 'quad':
      return lerp(lerp(s.p0, s.p1, t), lerp(s.p1, s.p2, t), t);
    case 'cubic': {
      const a = lerp(s.p0, s.p1, t);
      const b = lerp(s.p1, s.p2, t);
      const c = lerp(s.p2, s.p3, t);
      return lerp(lerp(a, b, t), lerp(b, c, t), t);
    }
  }
};

/** The first derivative (tangent vector, not normalised) at parameter t. */
export const derivative = (s: Segment, t: number): Vec2 => {
  switch (s.kind) {
    case 'line':
      return sub(s.p1, s.p0);
    case 'quad':
      return scale(lerp(sub(s.p1, s.p0), sub(s.p2, s.p1), t), 2);
    case 'cubic': {
      const d0 = sub(s.p1, s.p0);
      const d1 = sub(s.p2, s.p1);
      const d2 = sub(s.p3, s.p2);
      return scale(lerp(lerp(d0, d1, t), lerp(d1, d2, t), t), 3);
    }
  }
};

/** Splits at t into two segments of the same kind that together trace the original exactly. */
export const split = <S extends Segment>(s: S, t: number): [S, S] => {
  switch (s.kind) {
    case 'line': {
      const m = lerp(s.p0, s.p1, t);
      return [line(s.p0, m), line(m, s.p1)] as [S, S];
    }
    case 'quad': {
      const a = lerp(s.p0, s.p1, t);
      const b = lerp(s.p1, s.p2, t);
      const m = lerp(a, b, t);
      return [quad(s.p0, a, m), quad(m, b, s.p2)] as [S, S];
    }
    case 'cubic': {
      const a = lerp(s.p0, s.p1, t);
      const b = lerp(s.p1, s.p2, t);
      const c = lerp(s.p2, s.p3, t);
      const ab = lerp(a, b, t);
      const bc = lerp(b, c, t);
      const m = lerp(ab, bc, t);
      return [cubic(s.p0, a, ab, m), cubic(m, bc, c, s.p3)] as [S, S];
    }
  }
};

/** The same segment traversed from end to start. */
export const reverse = <S extends Segment>(s: S): S => {
  switch (s.kind) {
    case 'line':
      return line(s.p1, s.p0) as S;
    case 'quad':
      return quad(s.p2, s.p1, s.p0) as S;
    case 'cubic':
      return cubic(s.p3, s.p2, s.p1, s.p0) as S;
  }
};

/** Exact conversion of a line or quadratic to a cubic with the same shape (degree elevation). */
export const toCubic = (s: Segment): Cubic => {
  switch (s.kind) {
    case 'line':
      return cubic(s.p0, lerp(s.p0, s.p1, 1 / 3), lerp(s.p0, s.p1, 2 / 3), s.p1);
    case 'quad':
      return cubic(
        s.p0,
        add(s.p0, scale(sub(s.p1, s.p0), 2 / 3)),
        add(s.p2, scale(sub(s.p1, s.p2), 2 / 3)),
        s.p2,
      );
    case 'cubic':
      return s;
  }
};

export const mapPoints = <S extends Segment>(s: S, f: (p: Vec2) => Vec2): S => {
  switch (s.kind) {
    case 'line':
      return line(f(s.p0), f(s.p1)) as S;
    case 'quad':
      return quad(f(s.p0), f(s.p1), f(s.p2)) as S;
    case 'cubic':
      return cubic(f(s.p0), f(s.p1), f(s.p2), f(s.p3)) as S;
  }
};

/** The second derivative at parameter t (zero for a line, constant for a quadratic). */
export const secondDerivative = (s: Segment, t: number): Vec2 => {
  switch (s.kind) {
    case 'line':
      return vec2(0, 0);
    case 'quad':
      return scale(add(sub(s.p2, s.p1), sub(s.p0, s.p1)), 2);
    case 'cubic': {
      const a = add(sub(s.p2, s.p1), sub(s.p0, s.p1));
      const b = add(sub(s.p3, s.p2), sub(s.p1, s.p2));
      return scale(lerp(a, b, t), 6);
    }
  }
};
