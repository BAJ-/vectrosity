import { defineConfig } from 'vitest/config';

// `vitest run --mode stress` loads vitest.stress.ts, which runs every property test
// with many more random cases than the normal run.
export default defineConfig(({ mode }) => {
  const stress = mode === 'stress';
  return {
    test: {
      setupFiles: stress ? ['./vitest.stress.ts'] : [],
      // Property tests take far longer with 50 times the cases.
      testTimeout: stress ? 120_000 : 5_000,
    },
  };
});
