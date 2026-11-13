import { describe, expect, it } from 'vitest';
import { vec2, type Affine } from '@vcore/geometry';
import { guideSnapTargets, hitTestGuide, type Guide } from './guides';

describe('guides', () => {
  const guides: Guide[] = [
    { id: 'baseline', axis: 'y', position: 0 },
    { id: 'x-height', axis: 'y', position: 500 },
    { id: 'advance', axis: 'x', position: 600 },
  ];
  // Half size with y flipped and moved down 400 pixels, as a font view does:
  // model y 500 is screen y 400 - 250 = 150, model x 600 is screen x 300.
  const view: Affine = [0.5, 0, 0, -0.5, 0, 400];

  it('finds the nearest guide within the radius, in screen pixels', () => {
    expect(hitTestGuide(guides, vec2(50, 153), view, 5)?.id).toBe('x-height');
    expect(hitTestGuide(guides, vec2(296, 10), view, 5)?.id).toBe('advance');
    expect(hitTestGuide(guides, vec2(50, 398), view, 5)?.id).toBe('baseline');
  });

  it('finds nothing outside the radius', () => {
    expect(hitTestGuide(guides, vec2(50, 250), view, 5)).toBeNull();
  });

  it('gives the guides as snap lines', () => {
    expect(guideSnapTargets(guides)).toEqual({ xs: [600], ys: [0, 500] });
  });
});
