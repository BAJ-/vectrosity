import type { Segment } from './segment';

/**
 * This segment's contribution to the signed area of a closed contour:
 * 1/2 * integral of (x dy - y dx), exact for lines, quadratics and cubics (Green's theorem).
 * Sign: positive for a counter-clockwise contour in a y-up frame
 * (which is clockwise on screen in a y-down frame). The core never assumes which way y points;
 * apps decide what "outer" direction means for them.
 */
export const segmentSignedArea = (s: Segment): number => {
  switch (s.kind) {
    case 'line':
      return (s.p0.x * s.p1.y - s.p1.x * s.p0.y) / 2;
    case 'quad': {
      const { p0, p1, p2 } = s;
      return (p0.x * (2 * p1.y + p2.y) + 2 * p1.x * (p2.y - p0.y) - p2.x * (p0.y + 2 * p1.y)) / 6;
    }
    case 'cubic': {
      const { p0, p1, p2, p3 } = s;
      return (
        (p0.x * (6 * p1.y + 3 * p2.y + p3.y) +
          3 * (p1.x * (-2 * p0.y + p2.y + p3.y) - p2.x * (p0.y + p1.y - 2 * p3.y)) -
          p3.x * (p0.y + 3 * p1.y + 6 * p2.y)) /
        20
      );
    }
  }
};

/**
 * Signed area enclosed by segments that form a closed loop (each segment's end is the next one's start,
 * and the last ends where the first starts). Not meaningful for open contours.
 */
export const signedArea = (segments: readonly Segment[]): number =>
  segments.reduce((sum, s) => sum + segmentSignedArea(s), 0);
