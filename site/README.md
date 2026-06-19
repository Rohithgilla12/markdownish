# Landing page

A single self-contained `index.html` — no build step, no dependencies. Fonts load
from Google Fonts (Spectral, Cardo, Geist, Geist Mono); everything else is inline.
Built in the app's own **Vellum & Ink** system, with the OKLCH tokens lifted
verbatim from `src/styles/globals.css`.

## Preview locally

```bash
open site/index.html          # or any static server
python3 -m http.server -d site 8080
```

## Deploy to GitHub Pages

Two easy paths:

1. **Settings → Pages**, source = `Deploy from a branch`, branch = `main`,
   folder = `/site` (rename to `/docs` if you prefer the GitHub default), or
2. add a Pages Actions workflow that uploads `./site` as the artifact.

Point a custom domain (e.g. `markdownish.app`) at it from the Pages settings.

## Notes

- Pure HTML/CSS, no JS required for the page to render. The terminal caret and
  entrance reveals are CSS animations and respect `prefers-reduced-motion`.
- The hero contains a hand-built CSS mock of the app window — keep it in sync with
  the real UI if the layout changes meaningfully.
- Update the download links if the release/repo URLs change.
