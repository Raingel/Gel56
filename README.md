# Gel56

A browser-based tool for gel electrophoresis image analysis.

**Web app:** https://raingel.github.io/Gel56/

Gel56 runs in your browser. No installation or server upload is needed. The interface is available in Traditional Chinese (Taiwan), English, and Japanese. Your language choice is remembered in your browser.

## Features

- Rotate images 90° left or right to fix their orientation, then align, crop, and adjust them.
- Switch the interface between Traditional Chinese (Taiwan), English, and Japanese.
- Follow Step 1–10 and hover over ? for short explanations.
- Correct uneven background illumination.
- Set gel lanes and select DNA ladder lanes.
- Detect bands automatically, then review or edit them manually.
- Estimate fragment sizes from a DNA ladder. Local log-linear interpolation between adjacent ladder bands is the default; global semi-log regression remains available.
- Measure relative band intensity within each lane.
- Export band data as CSV or TSV, or make an exploratory presence/absence matrix.
- Name each lane or sample. Names are saved in `.gelproj` and included in result tables and charts.
- View Dice/UPGMA dendrograms, pairwise similarity heatmaps, and 2D PCoA plots from the same band matrix.
- Use the current matrix or paste a CSV; export each chart as SVG and UPGMA as Newick.
- Save a `.gelproj` file with the original image and analysis settings.

## How to use

1. Open the [web app](https://raingel.github.io/Gel56/) or download `index.html` and open it in a browser.
2. Load a gel image. If it appears sideways, rotate it 90° left or right before drawing the horizontal guide line.
3. Adjust the image and set the lane positions.
4. Select the DNA ladder lanes and detect bands.
5. Mark the ladder lanes, enter sample names, then review band calls and enter ladder fragment sizes.
6. Calculate fragment sizes, export the results, or open Fingerprint charts for UPGMA, heatmap and PCoA.
7. Save the `.gelproj` file to continue later.

## Notes

- Check all detected bands against the gel image, especially weak bands.
- For broad-range ladders, a single global semi-log line may be inaccurate. Local interpolation does not extrapolate beyond the outer ladder bands.
- Saved projects retain their chosen sizing method. Old projects without a stored choice use local interpolation.
- Relative band intensity is intended for comparisons within a lane, not absolute comparisons across lanes.
- The presence/absence matrix groups bands by estimated size. Bands in the same size group are not necessarily homologous.
- All three charts use Dice distances from binary band presence/absence (not band intensity). Unresolved bands and all-zero samples are excluded.
- PCoA is a 2D approximation; Dice distance can give negative eigenvalues. Axis percentages are calculated from positive eigenvalues.
- No bootstrap values are calculated. These charts show fingerprint similarity and are not phylogenetic evidence.
- Keep the original gel images. A `.gelproj` file includes the original image and processing steps.
- Gel56 is under development. Analysis results should be checked before use in a publication.
