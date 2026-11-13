import { counterIds, removeOverlap, toSegments, type Path } from '@vcore/path';
import { Font, Glyph, Path as FontPath } from 'opentype.js';

/** One glyph to export: its name, character, advance width and outline (font units). */
export interface ExportGlyph {
  readonly name: string;
  readonly unicode: number;
  readonly advance: number;
  readonly path: Path;
}

/** Font-wide vertical metrics, in font units. */
export interface ExportMetrics {
  readonly unitsPerEm: number;
  readonly ascender: number;
  readonly descender: number;
  readonly xHeight: number;
  readonly capHeight: number;
}

/**
 * The family name of exported fonts. Not "Source Serif": the fixture font's licence (SIL OFL)
 * reserves the name "Source" for the original, so a changed copy must be called something else.
 */
export const FAMILY_NAME = 'Vectrosity Sample';

/**
 * An outline ready for the font file: overlaps removed (outer contours counter-clockwise, as
 * CFF expects) and every coordinate rounded to a whole font unit, as font files store them.
 */
const toFontPath = (path: Path): FontPath => {
  const merged = removeOverlap(path, {
    fillRule: 'nonzero',
    outer: 'counterclockwise',
    ids: counterIds('export-'),
  });
  const out = new FontPath();
  const r = Math.round;
  for (const contour of merged.contours) {
    const segments = toSegments(contour);
    const first = segments[0];
    if (!first) continue;
    out.moveTo(r(first.p0.x), r(first.p0.y));
    for (const s of segments) {
      if (s.kind === 'line') out.lineTo(r(s.p1.x), r(s.p1.y));
      else if (s.kind === 'quad') out.quadTo(r(s.p1.x), r(s.p1.y), r(s.p2.x), r(s.p2.y));
      else out.curveTo(r(s.p1.x), r(s.p1.y), r(s.p2.x), r(s.p2.y), r(s.p3.x), r(s.p3.y));
    }
    out.close();
  }
  return out;
};

/** Builds an OpenType font file (CFF outlines, .otf) from the glyphs. */
export const exportOtf = (glyphs: readonly ExportGlyph[], metrics: ExportMetrics): ArrayBuffer => {
  // Every font starts with .notdef, drawn where a character has no glyph; here it is empty.
  const notdef = new Glyph({
    name: '.notdef',
    advanceWidth: Math.round(metrics.unitsPerEm / 2),
    path: new FontPath(),
  });
  const font = new Font({
    familyName: FAMILY_NAME,
    styleName: 'Regular',
    unitsPerEm: metrics.unitsPerEm,
    ascender: metrics.ascender,
    descender: metrics.descender,
    glyphs: [
      notdef,
      ...glyphs.map(
        (g) =>
          new Glyph({
            name: g.name,
            unicode: g.unicode,
            advanceWidth: Math.round(g.advance),
            path: toFontPath(g.path),
          }),
      ),
    ],
  });
  // opentype.js would guess these from the outlines of x and H; use the font's own values.
  font.tables.os2 = { sxHeight: metrics.xHeight, sCapHeight: metrics.capHeight };
  return font.toArrayBuffer();
};
