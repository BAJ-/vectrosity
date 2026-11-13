import { inject } from 'vitest';

/** A fixture font as stored in fixtures/*.json: metrics, and each glyph as SVG path data. */
export interface FontFixture {
  readonly unitsPerEm: number;
  readonly ascender: number;
  readonly descender: number;
  readonly xHeight: number;
  readonly capHeight: number;
  readonly glyphs: Readonly<Record<string, { readonly advance: number; readonly d: string }>>;
}

declare module 'vitest' {
  export interface ProvidedContext {
    sourceSerif4: FontFixture;
  }
}

/** Source Serif 4 (OFL), provided to tests by vitest.config.ts. */
export const sourceSerif4 = (): FontFixture => inject('sourceSerif4');
