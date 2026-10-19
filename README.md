# Gel56

A browser-based tool for gel electrophoresis image analysis.

**Web app:** https://raingel.github.io/Gel56/

Gel56 runs in your browser. No installation or server upload is needed. The interface is currently in Traditional Chinese.

## Features

- Rotate, crop, and adjust gel images.
- Correct uneven background illumination.
- Set gel lanes and select DNA ladder lanes.
- Detect bands automatically, then review or edit them manually.
- Estimate fragment sizes from a DNA ladder using semi-log regression or local interpolation.
- Measure relative band intensity within each lane.
- Export band data as CSV or TSV, or make an exploratory presence/absence matrix.
- Save a `.gelproj` file with the original image and analysis settings.

## How to use

1. Open the [web app](https://raingel.github.io/Gel56/) or download `index.html` and open it in a browser.
2. Load a gel image, align it, and crop it if needed.
3. Adjust the image and set the lane positions.
4. Select the DNA ladder lanes and detect bands.
5. Review the band calls and enter the ladder fragment sizes.
6. Calculate fragment sizes and export the results, or save the project to continue later.

## Notes

- Check all detected bands against the gel image, especially weak bands.
- Relative band intensity is intended for comparisons within a lane, not absolute comparisons across lanes.
- The presence/absence matrix groups bands by estimated size. Bands in the same size group are not necessarily homologous.
- Keep the original gel images. A `.gelproj` file includes the original image and processing steps.
- Gel56 is under development. Analysis results should be checked before use in a publication.
