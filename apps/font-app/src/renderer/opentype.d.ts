// opentype.js 2.0 ships without type declarations. These cover only what export.ts uses.
declare module 'opentype.js' {
  export class Path {
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    quadTo(x1: number, y1: number, x: number, y: number): void;
    curveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number): void;
    close(): void;
  }

  export class Glyph {
    constructor(options: { name: string; unicode?: number; advanceWidth: number; path: Path });
  }

  export class Font {
    constructor(options: {
      familyName: string;
      styleName: string;
      unitsPerEm: number;
      ascender: number;
      descender: number;
      glyphs: Glyph[];
    });
    /** Values here override the ones opentype.js works out for each table. */
    tables: { os2?: { sxHeight?: number; sCapHeight?: number } };
    toArrayBuffer(): ArrayBuffer;
  }
}
