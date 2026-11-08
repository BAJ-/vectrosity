import { isClosed, type Path } from './model';
import { toSegments } from './segments';

/**
 * Anything that accepts path drawing commands. Both the browser's Path2D and
 * CanvasRenderingContext2D fit, so the core needs no DOM types:
 *   const p = new Path2D(); drawPath(path, p); ctx.fill(p);
 */
export interface PathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void;
  closePath(): void;
}

/** Sends the path's outline to a sink, one subpath per contour. */
export const drawPath = (path: Path, sink: PathSink): void => {
  for (const c of path.contours) {
    const segments = toSegments(c);
    const first = segments.at(0);
    if (!first) continue;
    sink.moveTo(first.p0.x, first.p0.y);
    for (const s of segments) {
      if (s.kind === 'line') sink.lineTo(s.p1.x, s.p1.y);
      if (s.kind === 'quad') sink.quadraticCurveTo(s.p1.x, s.p1.y, s.p2.x, s.p2.y);
      if (s.kind === 'cubic') sink.bezierCurveTo(s.p1.x, s.p1.y, s.p2.x, s.p2.y, s.p3.x, s.p3.y);
    }
    if (isClosed(c)) sink.closePath();
  }
};
