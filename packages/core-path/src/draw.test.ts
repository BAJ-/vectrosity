import { describe, expect, it } from 'vitest';
import { counterIds } from './ids';
import { drawPath, type PathSink } from './draw';
import { fromSvgPath } from './svg';

const recorder = () => {
  const calls: string[] = [];
  const sink: PathSink = {
    moveTo: (...a) => calls.push(`moveTo ${a.join(' ')}`),
    lineTo: (...a) => calls.push(`lineTo ${a.join(' ')}`),
    quadraticCurveTo: (...a) => calls.push(`quadraticCurveTo ${a.join(' ')}`),
    bezierCurveTo: (...a) => calls.push(`bezierCurveTo ${a.join(' ')}`),
    closePath: () => calls.push('closePath'),
  };
  return { calls, sink };
};

describe('drawPath', () => {
  it('sends each contour as a subpath, closing only closed ones', () => {
    const path = fromSvgPath('M0 0 C0 10 10 10 10 0 Q5 -5 0 0 Z M20 0 L30 0', counterIds());
    const { calls, sink } = recorder();
    drawPath(path, sink);
    expect(calls).toEqual([
      'moveTo 0 0',
      'bezierCurveTo 0 10 10 10 10 0',
      'quadraticCurveTo 5 -5 0 0',
      'closePath',
      'moveTo 20 0',
      'lineTo 30 0',
    ]);
  });
});
