BDM ICON SET - CLEAN CUT PACKAGE

Contents
--------
60 icons extracted individually from the supplied 6x10 sheet.

Production PNG sizes:
- 20x20 px
- 28x28 px
- 40x40 px
- 64x64 px

Also included:
- 256x256 transparent master PNG for every icon
- manifest.csv
- validation.json
- catalog_60_icons_64px.png

Extraction rules
----------------
- Every crop is taken only from the central area of its own source cell.
- Neighboring cells and cell borders are excluded before foreground extraction.
- Dark tile backgrounds are removed.
- Transparent padding is normalized.
- Every output is centered in a square canvas.
- Validation checks that no foreground touches any output edge.

Important about SVG
-------------------
The supplied source sheet is raster artwork. This package intentionally does NOT
include fake SVG files that merely embed PNG images. Those would not be genuine
vector assets. The masters here are clean transparent PNGs suitable as the
source for a proper manual/vector reconstruction if true SVG paths are required.
