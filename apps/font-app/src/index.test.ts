import { expect, it } from 'vitest';
import { smokeTest } from './index';

it('imports every core package', () => {
  expect(smokeTest()).toBe(true);
});
