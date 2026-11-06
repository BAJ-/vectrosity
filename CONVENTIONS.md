# Core conventions

- **Tolerances are arguments.** Geometry takes model-unit tolerances; editing takes screen-pixel tolerances. No hidden epsilon constants.
- **Numbers are float64.** Rounding to integers happens only in the font app's export.
- **Geometry is pure.** Functions return new values and never mutate their input.
- **Editing changes data only through deltas** (`set`, `insert`, `delete`), each with an inverse.
- **Degenerate input** (zero-length handles, coincident points, zero-area contours) is either handled or rejected, and the doc comment says which.
- **Structure:** every path operation is documented as structure-preserving or structure-changing. Point IDs survive structure-preserving operations.
- **No DOM, React, Electron or Node** in `packages/*`. `npm run check:imports` enforces this.
- **Each package imports only what its package.json declares.**
- **Tests:** unit tests for known cases, fast-check properties for invariants, fixtures for real glyphs.
- **Formatting is Prettier's.** Run `npm run format` before committing; `npm run check` fails on unformatted code.
