# Pial — An offline atlas of the human brain

Pial is a working, interactive Three.js atlas built from real FreeSurfer
fsaverage5 surfaces and annotations, fsaverage aseg, and the MNI152 ICBM 2009c
nonlinear asymmetric T1 population template. It runs entirely on your device.

## Open the application

Open **`dist/Pial-Atlas.html`** in a current Chrome, Edge, Firefox, or Safari
browser with WebGL 2, WebAssembly, and DecompressionStream support. No server,
internet connection, installation, account, or external font is required.
Chrome was used for the automated and visual verification; other browsers are
supported by the chosen web APIs but were not independently tested.

The standalone HTML includes the application, processed geometry, volume,
meshoptimizer decoder, and full dataset/runtime licence notices. The exact final
byte count and SHA-256 are recorded in `reports/build.json`.

## Explore

- Drag to rotate; use the wheel or a two-finger pinch to zoom. Right-drag or a
  two-finger gesture pans. Camera buttons provide lateral, medial, dorsal,
  ventral, anterior, posterior, and home views. Medial view isolates the left
  hemisphere; **End isolation** or **Restore all** returns the other structures.
- Browse **Brain → Forebrain → Left cerebral hemisphere → Frontal lobe →
  Precentral gyrus**, or search across all four schemes. Click the brain to
  inspect a parcel by its label ID. Use **Focus**, **Isolate**, **Hide**, or
  **Parent** in the inspector.
- Choose Desikan–Killiany, Destrieux, Yeo 7, or Yeo 17. The scheme changes
  instantly through a shader lookup; it does not reload geometry. Open the
  **Parcellation legend** tab for the active labels and their display colours.
- Move the surface slider through pial, white, inflated, sphere, and flat map.
  Each hemisphere retains its shared vertex correspondence. Separate the
  hemispheres or lift the deep structures with the independent layout sliders.
  **Source positions** animates back to pial with all offsets removed.
- Use eye buttons and **Display** layer switches for independent visibility.
  The opacity slider controls the current navigation group. Hidden parcels
  remain hidden through morph, scheme, layout, and material changes. Hiding a
  parcel retains its vertex footprint even when another scheme is selected.
  Lobe masks use the cited DK membership in every scheme.
- **Undo** restores anatomical state, including visibility, opacity, selection,
  clipping, scheme, and morph changes. Slider gestures are one undo step. Camera
  movements are separate. **Restore all** clears hiding, isolation, and opacity
  changes. **Reset** restores the initial atlas and can itself be undone.
- **Display** provides anatomical colour, porcelain, wireframe, and glass modes.
  **Slices** provides sagittal, coronal, and axial clipping, reverse direction,
  textured T1 planes, and MNI coordinates. Multiple planes can be active.
- Toggle labels, automatic rotation, or fullscreen. **PNG** exports the current
  brain viewport. The seven-step **Guided journey** covers the whole brain,
  lobes, a named parcel, inflation, networks, and deep structures. It preserves
  existing hidden rules.
- Press `/` to search, `Escape` to close tool popovers, or `Ctrl/Cmd+Z` to undo.

On narrow screens, the structure panel moves below the viewer so the anatomy
and controls remain usable without horizontal scrolling.

## What is included

| Data | Actual imported count |
| --- | ---: |
| Cortical surface states | 8: pial, white, inflated, sphere × 2 hemispheres |
| Derived flat maps | 2 |
| Shared cortical meshes | 2 |
| Unique cortical vertices | 20,484 total; 10,242 per hemisphere |
| Cortical triangles | 40,960 |
| Desikan–Killiany named parcels | 68 |
| Destrieux named parcels | 148 |
| Yeo 7-network labels | 14 hemisphere-specific labels; 7 networks |
| Yeo 17-network labels | 34 hemisphere-specific labels; 17 networks |
| Named labels across schemes | 264 |
| Additional unassigned / medial-wall source labels | 10 |
| Selectable aseg meshes | 21, with 50,672 triangles |
| MNI T1 display volume | 97 × 115 × 97, at 2 mm |

The 21 aseg meshes include bilateral thalamus, caudate, putamen, pallidum,
hippocampus, amygdala, nucleus accumbens, ventral diencephalon, cerebellar cortex,
and cerebellar white matter, plus one brainstem. No subdivisions are invented
inside an undivided source label.

## Interpret the atlas correctly

**The MRI slices are a population template, not an individual scan.**
fsaverage surfaces start in MNI305 space; the MRI does not. A documented affine
registration maps both cortical and aseg meshes to MNI152NLin2009cAsym RAS.
The full matrix is in `data/alignment.json`. Alignment is approximate between
population templates; individual sulci and tissue boundaries do not match
perfectly. See the independently generated contour montage in
`reports/alignment.png` and the metrics in `reports/alignment-metrics.json`.

Inflated, spherical, and flat states are non-anatomical representations.
Separation and lift are display offsets. Slices remain in MNI coordinates and
the UI warns when a deformed layout prevents direct anatomical comparison.
The flat maps are derived Lambert projections with a masked antipodal seam,
not imported FreeSurfer flat patches or faithful distance maps.

**Parcellations are conventions that differ between schemes.** DK lobes follow
the [FreeSurfer published mapping](https://surfer.nmr.mgh.harvard.edu/fswiki/CorticalParcellation#Lobe_mapping).
Cingulate cortex and insula remain separate. Destrieux navigation is derived
from measured overlap with these DK groups; this is disclosed in the inspector.
Network labels remain under **Distributed networks**, since they span lobes.
The atlas makes no unsourced functional claims and has not been clinically
validated. It is an educational and research application.

## Rebuild from the processed assets

Requirements: Node.js 22 or later and npm. Versions of all JavaScript
dependencies are pinned in `package.json` and `package-lock.json`.

```sh
npm ci
npm run build
```

This rebuild uses `data/atlas.meshopt.json` when raw preprocessing outputs are
absent. It does not need any raw dataset downloads or Python packages. The
output remains a single offline HTML file. `scripts/build.mjs` is portable
between Windows, macOS, and Linux.

## Reproduce the raw-data pipeline

Python 3.13 was used for this release. All direct Python versions are in
`requirements.in`; the complete dependency graph and package hashes are pinned
in `requirements.lock`. A fresh virtual environment is recommended.

```sh
python -m venv .venv
```

Activate the environment using your platform's normal procedure, then run:

```sh
python -m pip install --require-hashes -r requirements.lock
python pipeline/fetch.py
python pipeline/preprocess.py
npm ci
npm run build
```

Alternatively, after installing the locked Python dependencies, the portable
driver performs the download, preprocessing, and build in order:

```sh
python scripts/rebuild.py --from-raw
```

The downloader retrieves only the licence-reviewed URLs in `pipeline/fetch.py`.
Inputs go to the ignored `.cache/raw/` directory. Their checksums are verified
against `data/sources.json`. Temporary typed buffers go to `build/`, which is
also excluded from release packaging. The pipeline reuses the saved affine in
`data/alignment.json`; `--recompute-alignment` explicitly estimates it again.
No FreeSurfer executable, licence key, or credentials are needed to reproduce
these public-data derivatives.

The pipeline performs correspondence validation, annotation decoding, a
documented DK lobe mapping, measured Destrieux overlap, aseg marching cubes,
centroid-preserving Taubin smoothing, coordinate transformation, T1 intensity
windowing, and spatial QA. TemplateFlow already supplies the T1 at 2 mm; the
pipeline preserves its affine and samples rather than resampling it again.

## Tests and visual verification

```sh
python -m pytest tests/test_geometry.py -q
node tests/compression.mjs
npm run test:state
npm run test:browser
```

Geometry and compression tests need the raw cache and intermediate buffers
produced by the pipeline. State and browser tests use the shipped processed
assets. The browser suite defaults to an installed Google Chrome. Set
`BROWSER_CHANNEL=msedge` to use Edge. To use bundled Chromium, run
`npx playwright install chromium` and set `BROWSER_CHANNEL=bundled` using your
shell's environment-variable syntax.

The browser tests open `file://` with networking explicitly offline, without
file-access or web-security overrides. They exercise hierarchy, picking,
cross-scheme search, morph targets, persistent masks, material modes, undo,
opacity, isolation, camera presets, rotation, zoom, all clipping directions,
slice textures, labels, automatic exploration, PNG export, fullscreen, the
guided journey, licence access, and responsive layouts. Console errors and
network requests fail the suite. Screenshots are stored in `reports/`.

See `docs/VALIDATION.md` and the machine-readable reports for actual results,
including the limitations of the spatial checks.

## Source layout and future layers

`src/` contains clean application code, `pipeline/` contains Python preprocessing,
`scripts/` contains portable build and release scripts, and `tests/` contains
the verification suites. `docs/ARCHITECTURE.md` explains the shader, picking,
visibility, coordinate, and morph designs.

The renderer's `LayerRegistry` has explicit coordinate-space and update hooks
for future layers. White-matter tracts, EEG electrodes, and connectome graphs
are not implemented or bundled in this release.

## Licences and attribution

All requested datasets permit redistribution with their retained notices.
FreeSurfer assets use the FreeSurfer Software License; Yeo source attribution
and CBIG's MIT notice are also retained; the MNI template uses its permissive
McGill notice. Three.js and meshoptimizer use MIT licences. The source code's
MIT licence is in `LICENSE`. Full dataset decisions, references, exact source
URLs, and counts are in `docs/DATA_SOURCES.md` and `data/sources.json`.

No requested dataset was excluded for licence reasons. The restricted-copying
BrainCOLOR protocol PDF was not redistributed; the cited FreeSurfer mapping
supplies the required lobe information. Raw downloads, dependencies, credentials,
machine paths, and unrelated files are excluded from the release archive.

All or portions of this licensed product (such portions are the "Software")
have been obtained under license from The General Hospital Corporation and are
subject to the terms and conditions reproduced in `licenses/FREESURFER.txt`.
That notice, `licenses/MNI.txt`, and `licenses/CBIG-MIT.txt` apply to the data
derivatives and accompany both the source package and the standalone HTML.
