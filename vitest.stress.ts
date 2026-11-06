import fc from 'fast-check';

// Loaded only by `npm run test:stress`. The normal run keeps fast-check's default of 100.
fc.configureGlobal({ numRuns: 5000 });
