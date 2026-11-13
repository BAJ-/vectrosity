import { readFileSync } from 'node:fs';
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
      // Fixture fonts for golden tests. Tests read them with inject() (see each package's
      // src/testing/fixtures.ts), so core code never touches the file system.
      provide: {
        sourceSerif4: JSON.parse(readFileSync('./fixtures/source-serif-4.json', 'utf8')),
      },
    },
  };
});
