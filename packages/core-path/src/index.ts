import type { Vec2 } from '@vcore/geometry';

export type PointType = 'move' | 'line' | 'curve' | 'qcurve' | 'offcurve';

export interface Point extends Vec2 {
  readonly id: string;
  readonly type: PointType;
  readonly smooth?: boolean;
}

export interface Contour {
  readonly id: string;
  readonly points: readonly Point[];
  readonly closed: boolean;
}

export interface Path {
  readonly contours: readonly Contour[];
}

export const emptyPath = (): Path => ({ contours: [] });
