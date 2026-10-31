"""Build the two pinned report font assets. Needs fontTools only to regenerate.

The app embeds the prebuilt fonts with PDF-Lib and uses the included nominal
glyph metrics, avoiding browser font downloads and platform substitutions.
"""
from pathlib import Path
from io import BytesIO
import base64
import json
from fontTools import subset
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parents[1]
fonts = []
for style in ["", "-Bold"]:
    font = TTFont(f"/usr/share/fonts/truetype/dejavu/DejaVuSans{style}.ttf")
    options = subset.Options()
    options.hinting = False
    options.drop_tables += ["FFTM", "MATH", "GPOS", "GSUB", "GDEF"]
    sub = subset.Subsetter(options=options)
    sub.populate(unicodes=list(range(32, 0x530)) + list(range(0x2000, 0x2070)))
    sub.subset(font)
    buffer = BytesIO()
    font.save(buffer)
    font = TTFont(BytesIO(buffer.getvalue()))
    cmap = font.getBestCmap()
    head, hhea, os2 = font["head"], font["hhea"], font["OS/2"]
    fonts.append({
        "data": base64.b64encode(buffer.getvalue()).decode(),
        "name": "RaceDataSansBold" if style else "RaceDataSans",
        "unitsPerEm": head.unitsPerEm,
        "ascent": hhea.ascent, "descent": hhea.descent,
        "capHeight": getattr(os2, "sCapHeight", hhea.ascent),
        "bbox": {"minX": head.xMin, "maxX": head.xMax, "minY": head.yMin, "maxY": head.yMax},
        "glyphs": [[cp, font.getGlyphID(glyph), font["hmtx"][glyph][0]] for cp, glyph in sorted(cmap.items())],
    })
(root / "web/report-font-data.mjs").write_text("export const reportFonts = " + json.dumps(fonts, separators=(",", ":")) + ";\n")
licence = Path("/usr/share/doc/fonts-dejavu-core/copyright").read_text().split("Files: debian/*")[0]
(root / "web/vendor/Report-Fonts-LICENSE.md").write_text(licence)
