/** A 2D point or vector. Coordinates are model units; the core does not assume which way y points. */
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export const vec2 = (x: number, y: number): Vec2 => ({ x, y });

export const add = (a: Vec2, b: Vec2): Vec2 => vec2(a.x + b.x, a.y + b.y);
export const sub = (a: Vec2, b: Vec2): Vec2 => vec2(a.x - b.x, a.y - b.y);
export const scale = (v: Vec2, s: number): Vec2 => vec2(v.x * s, v.y * s);
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
/** z-component of the 3D cross product: positive when b is counter-clockwise from a in a y-up frame. */
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
export const length = (v: Vec2): number => Math.hypot(v.x, v.y);
export const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 =>
  vec2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);

/** True when a and b are within `tolerance` of each other (model units). */
export const nearlyEqual = (a: Vec2, b: Vec2, tolerance: number): boolean =>
  distance(a, b) <= tolerance;
