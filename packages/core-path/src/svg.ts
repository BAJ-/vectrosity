import { add, cubic, line, quad, sub, vec2, type Segment, type Vec2 } from '@vcore/geometry';
import type { IdGenerator } from './ids';
import { isClosed, type Contour, type Path } from './model';
import { contourFromSegments, toSegments } from './segments';

/**
 * The path as SVG path data ("d" attribute), using absolute M, L, Q, C and Z commands.
 * Numbers are written in full, so parsing the result gives back exactly the same outline.
 */
export const toSvgPath = (path: Path): string =>
  path.contours
    .map((c) => {
      const segments = toSegments(c);
      const first = segments.at(0);
      if (!first) return '';
      const parts = [`M${first.p0.x} ${first.p0.y}`];
      for (const s of segments) {
        if (s.kind === 'line') parts.push(`L${s.p1.x} ${s.p1.y}`);
        if (s.kind === 'quad') parts.push(`Q${s.p1.x} ${s.p1.y} ${s.p2.x} ${s.p2.y}`);
        if (s.kind === 'cubic') {
          parts.push(`C${s.p1.x} ${s.p1.y} ${s.p2.x} ${s.p2.y} ${s.p3.x} ${s.p3.y}`);
        }
      }
      if (isClosed(c)) parts.push('Z');
      return parts.join(' ');
    })
    .filter((d) => d !== '')
    .join(' ');

const TOKEN = /[MmLlHhVvCcSsQqTtZzAa]|[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g;

/**
 * Parses SVG path data into a path. Supports M, L, H, V, C, S, Q, T and Z, absolute and
 * relative. Arcs (A) are not supported yet and throw, as does malformed data.
 * Each subpath becomes a contour; one ended by Z is closed.
 */
export const fromSvgPath = (d: string, ids: IdGenerator): Path => {
  const leftover = d.replace(TOKEN, '').replace(/[\s,]/g, '');
  if (leftover !== '') throw new SyntaxError(`unexpected characters in path data: ${leftover}`);
  const tokens = d.match(TOKEN) ?? [];
  let index = 0;
  const isCommand = (t: string | undefined) => t !== undefined && /^[A-Za-z]$/.test(t);
  const number = (): number => {
    const t = tokens.at(index++);
    if (t === undefined || isCommand(t))
      throw new SyntaxError('path data ended or a number is missing');
    return Number(t);
  };

  const contours: Contour[] = [];
  let segments: Segment[] = [];
  let current = vec2(0, 0);
  let start = vec2(0, 0);
  // The last control point, for the smooth commands S and T (reflected about the current point).
  let lastCubicControl: Vec2 | null = null;
  let lastQuadControl: Vec2 | null = null;

  const finish = (closed: boolean) => {
    if (segments.length > 0) contours.push(contourFromSegments(segments, closed, ids));
    segments = [];
  };

  let command = '';
  while (index < tokens.length) {
    const token = tokens.at(index);
    if (isCommand(token)) {
      command = token ?? '';
      index++;
    } else if (command === '' || command === 'Z' || command === 'z') {
      throw new SyntaxError('path data must start with a command');
    }
    const relative = command === command.toLowerCase();
    const point = (): Vec2 => {
      const p = vec2(number(), number());
      return relative ? add(current, p) : p;
    };
    const reflect = (control: Vec2 | null): Vec2 =>
      control ? sub(add(current, current), control) : current;
    let nextCubic: Vec2 | null = null;
    let nextQuad: Vec2 | null = null;
    switch (command.toUpperCase()) {
      case 'M': {
        finish(false);
        current = point();
        start = current;
        // Further coordinate pairs after a moveto are linetos.
        command = relative ? 'l' : 'L';
        break;
      }
      case 'L': {
        const p = point();
        segments.push(line(current, p));
        current = p;
        break;
      }
      case 'H': {
        const x = number();
        const p = vec2(relative ? current.x + x : x, current.y);
        segments.push(line(current, p));
        current = p;
        break;
      }
      case 'V': {
        const y = number();
        const p = vec2(current.x, relative ? current.y + y : y);
        segments.push(line(current, p));
        current = p;
        break;
      }
      case 'C': {
        const c1 = point();
        const c2 = point();
        const p = point();
        segments.push(cubic(current, c1, c2, p));
        nextCubic = c2;
        current = p;
        break;
      }
      case 'S': {
        const c1 = reflect(lastCubicControl);
        const c2 = point();
        const p = point();
        segments.push(cubic(current, c1, c2, p));
        nextCubic = c2;
        current = p;
        break;
      }
      case 'Q': {
        const c = point();
        const p = point();
        segments.push(quad(current, c, p));
        nextQuad = c;
        current = p;
        break;
      }
      case 'T': {
        const c = reflect(lastQuadControl);
        const p = point();
        segments.push(quad(current, c, p));
        nextQuad = c;
        current = p;
        break;
      }
      case 'Z': {
        // A drawing command after Z starts a new subpath at the same start point.
        finish(true);
        current = start;
        break;
      }
      case 'A':
        throw new SyntaxError('arc commands (A) are not supported yet');
      default:
        throw new SyntaxError(`unknown path command ${command}`);
    }
    lastCubicControl = nextCubic;
    lastQuadControl = nextQuad;
  }
  finish(false);
  return { contours };
};
