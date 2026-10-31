import { reportFonts } from './report-font-data.mjs';

// Fixed nominal glyph metrics generated alongside the fixed TrueType files.
// Only the small Fontkit interface used by pinned PDF-Lib 1.17.1 is needed.
// No font parsing, external font downloads or platform font substitution.
export async function embedReportFonts(doc) {
  const fonts = [];
  for (const data of reportFonts) {
    const glyphs = new Map(data.glyphs.map(([cp, id, advanceWidth]) => [cp, { id, advanceWidth, codePoints: [cp] }]));
    const font = {
      postscriptName: data.name, unitsPerEm: data.unitsPerEm,
      ascent: data.ascent, descent: data.descent, capHeight: data.capHeight,
      xHeight: data.unitsPerEm / 2, italicAngle: 0, bbox: data.bbox,
      characterSet: [...glyphs.keys()], post: { isFixedPitch: false }, head: { macStyle: { italic: false } },
      glyphForCodePoint: cp => glyphs.get(cp),
      layout: text => ({ glyphs: [...text].map(ch => {
        const glyph = glyphs.get(ch.codePointAt(0));
        if (!glyph) throw new Error('Unsupported report glyph');
        return glyph;
      }) }),
    };
    doc.registerFontkit({ create: () => font });
    fonts.push(await doc.embedFont(Uint8Array.from(atob(data.data), c => c.charCodeAt(0))));
  }
  return fonts;
}
