# Dither Filter Tool

Standalone browser tool for applying a seven-state SVG dithering filter to uploaded images or videos.

## Run

```sh
python3 -m http.server 4177
```

Then open `http://127.0.0.1:4177/`.

## Features

- Upload image or video sources.
- Switch between original aspect ratio and 1x1.
- Control grid resolution, cell padding, background color, and tone inversion.
- Upload seven SVG masks in bulk or replace each state individually.
- Includes seven default basic SVG masks in `symbols/basic/`.
- Also includes the earlier abstract space-time masks in `symbols/`.
- Recolor every state from shadow through highlight.
- Scale symbols using shadow minimum, midtone, and highlight maximum controls.
- Snap symbol rotation to 0, 90, 180, or 270 degrees.
- Auto-rotate symbols at a configurable interval.
- Export the current frame as PNG.
- Record the filtered canvas as WebM.
