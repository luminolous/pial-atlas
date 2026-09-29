# Pial Atlas

Pial Atlas is a working, interactive Three.js atlas built from real FreeSurfer
fsaverage6 surfaces and annotations, fsaverage aseg, and the MNI152 ICBM 2009c
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
  through a 300 ms shader lookup cross-fade without reloading geometry. The selector
  sits directly above its labels in the **Parcellation legend** tab.
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
  brain viewport with the original brain glyph, Pial Atlas watermark, and source
  attribution. The seven-step **Guided journey** covers the whole brain,
  lobes, a named parcel, inflation, networks, and deep structures. It preserves
  existing hidden rules.
- Press `/` to search, `Escape` to close the inspector and tool popovers, or
  `Ctrl/Cmd+Z` to undo. Camera shortcuts are `0` (home), `1` (lateral), `2`
  (medial), `3` (dorsal), `4` (ventral), `5` (anterior), and `6` (posterior).
  Use `D` for display, `S` for slices, `L` for labels, `A` for automatic
  exploration, `F` for fullscreen, and `P` for PNG export. Tooltips show these keys.

On narrow screens, the structure panel moves below the viewer so the anatomy
and controls remain usable without horizontal scrolling.

The navigation list uses 42 px structure rows and a thin, arrow-free custom
scrollbar that appears only when the list overflows, with scroll shadows. Its opacity,
undo, restore, and reset footer remains accessible. Selection opens a separate
canvas inspector whose content scrolls independently of its action buttons.
The guided journey uses its own dock, with the camera offset into the available
space. The active-scheme chip beside the coordinate-space badge is available
from both tabs and opens the parcellation selector in the legend. Home is the
first button in the View group. Camera buttons are highlighted only when the
actual position, target, up vector, and zoom match the requested preset. Manual
rotation clears the highlight; opening a panel preserves a manually placed
camera. Operating-system reduced-motion settings disable camera, layout, and
colour animations and automatic rotation.

## Colours, shading, and area measurements

The original application palettes remain the default. Desikan–Killiany and
Destrieux use the atlas's muted lobe palette in `pipeline/preprocess.py`, with
small deterministic label variations. These are original display colours, not
the FreeSurfer annotation table's RGB values. The lobe assignments follow the
cited FreeSurfer DK mapping and measured Destrieux overlap. Yeo 7 and Yeo 17
retain the RGB values in their imported FreeSurfer Yeo annotations, attributed
to [Yeo et al. and CBIG](https://github.com/ThomasYeoLab/CBIG/tree/master/stable_projects/brain_parcellation/Yeo2011_fcMRI_clustering).

**Display → Colourblind-safe palette** uses the nine unmodified colours from
[Paul Tol's muted qualitative palette](https://sronpersonalpages.nl/~pault/).
Its [original Python definition](https://sronpersonalpages.nl/~pault/data/tol_colors.py)
specifies the BSD 3-clause licence; the notice is retained in
`licenses/Paul-Tol.txt` and the standalone HTML. The application assigns these
colours independently for each scheme using a deterministic saturation-degree
colouring of the combined left/right parcel-adjacency graph. Bilateral labels
share a colour. Colours are reused in schemes with more than nine labels;
adjacency conflicts are minimized, but colours alone cannot uniquely identify
all parcels or guarantee discrimination for every form of colour-vision
deficiency. Boundaries, names, picking, and the legend remain available.
Switching palettes changes the colour lookup only, preserving labels, geometry,
selection, and hidden structures. Both controls support Undo and Reset.

Non-cortical anatomy is matte warm grey while viewing cortical parcellations.
Its FreeSurfer `FreeSurferColorLUT.txt` aseg colours return for any positive
lift, for a directly selected structure, or for the corresponding deep-anatomy
group being browsed in **Structures**. Browsing means entering the cerebellum,
brainstem, ventricles, diencephalon, or a hemisphere's deep-structure group;
the root Brain page does not activate this exception. Switching to the legend
ends the browsing exception. These structures never enter the cortical legend.
The previously pale inferior mesh in the left lateral view was identified by
label-ID ray picking as **Brainstem (aseg 16)**. Its opacity was already 1;
bright lighting and its blue-grey source material created a translucent
appearance. The context material is now matte, opaque, and front-sided, while
explicit opacity and glass controls continue to work.

**Curvature shading** is on by default. It uses the actual fsaverage6 `sulc`
values attached to the corresponding source vertices in every morph state.
Positive values darken sulci; negative values lighten gyri. The shared scale
is the 95th percentile of absolute values across both hemispheres. Values are
clamped to that scale. Sulci multiply luminance by 0.80–1.00; gyri multiply
it by 1.00–1.05. The shader applies one common gain to tone-mapped linear RGB,
after parcel colour and lighting and before output encoding and selection
dimming. This preserves linear-RGB channel ratios (chromaticity, hue, and
saturation), instead of blending towards white or grey. Brightening is reduced
when necessary to keep every channel in gamut without clipping. The original
parcel lookup and categorical boundary lines remain unchanged. This is average convexity from
FreeSurfer's inflation process, not a newly measured anatomical curvature or
depth in millimetres; see [Destrieux et al. (2010), section 2.2](https://surfer.nmr.mgh.harvard.edu/ftp/articles/2010/2010_-_Destrieux_et_al._-_NeuroImage.pdf).

Each compact legend row pairs matching left/right source labels. A split swatch
shows both colours when the original palette differs between hemispheres
(the Destrieux subcallosal label). The displayed
percentage is the arithmetic mean of the two hemisphere percentages; its
tooltip gives each value separately. Areas are measured on the **native
fsaverage6 white surface in MNI305 millimetres**, before the display affine,
compression, or morphing. Each triangle contributes one third of its area to
each labelled corner. Each hemisphere and scheme is normalized separately to
its assigned cortex, excluding that scheme's medial wall and unassigned source
labels. Assigned percentages therefore sum to 100% per hemisphere; this is not
a vertex-count percentage. The final dimmed unassigned row shows a dash because
it is excluded from that denominator, and combines its underlying source labels
for each visibility toggle. L/R buttons independently hide the corresponding
hemisphere's parcel. Names are available in full through tooltips and the
inspector. Schemes with more than 20 named labels have a filter field.

## Imported data counts

| Data | Actual imported count |
| --- | ---: |
| Cortical surface states | 8: pial, white, inflated, sphere × 2 hemispheres |
| Derived flat maps | 2 |
| Shared cortical meshes | 2 |
| Unique cortical vertices | 81,924 total; 40,962 per hemisphere |
| Cortical triangles | 163,840 |
| Desikan–Killiany named parcels | 68 |
| Destrieux named parcels | 148 |
| Yeo 7-network labels | 14 hemisphere-specific labels; 7 networks |
| Yeo 17-network labels | 34 hemisphere-specific labels; 17 networks |
| Named labels across schemes | 264 |
| Additional unassigned / medial-wall source labels | 10 |
| Selectable aseg meshes | 27, with 62,754 triangles |
| MNI T1 display volume | 97 × 115 × 97, at 2 mm |

The 27 aseg meshes include bilateral thalamus, caudate, putamen, pallidum,
hippocampus, amygdala, nucleus accumbens, ventral diencephalon, cerebellar cortex,
and cerebellar white matter, plus one brainstem. Six ventricular meshes include
bilateral lateral and inferior lateral ventricles, plus the third and fourth
ventricles. No subdivisions are invented
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

To start it from a terminal in the project directory, use `Start-Process
.\dist\Pial-Atlas.html` in Windows PowerShell, `open dist/Pial-Atlas.html` on
macOS, or `xdg-open dist/Pial-Atlas.html` on Linux. Closing the browser tab closes
the application; no local server or background service needs to be stopped.

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

The fsaverage6 sources contain 40,962 corresponding vertices per hemisphere.
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

The state command includes the additional lift-layout, categorical picking,
GPU correspondence, boundary-filter coverage, and motion tests. The browser
command also runs `tests/browser-polish.mjs`: 1920×1080, 1440×900, 1280×720,
short-height reachability, all surface states, every journey step, lift
collisions, pinned inspector actions, toolbar spacing, and reduced motion.
It also runs `tests/browser-appearance.mjs` at 1920×1080 and 1280×720 for every
scheme, both palettes, lift and selection states, hemisphere toggles, source
colour exceptions, area legends, filtering, and curvature shading in all five
surface states. The suite also opens the scheme selector from both tabs, checks
42 px structure rows and overflow-only scrollbars without arrow buttons, and
verifies Home and all six view highlights before and after real pointer rotation.
Rendered-pixel comparisons measure linear luminance bounds and chromaticity
preservation in every scheme with both palettes. Eight additional geometry tests independently integrate white
triangle areas and verify the medial-wall exclusion and percentages.

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
The [offline visual review gallery](reports/visual-review.html) links to all
screenshots from the layout, motion, and appearance suites.

To package and independently verify the clean release after testing, run
`python scripts/package_release.py` and `python scripts/verify_release.py`.
The latter extracts the archive into an ignored temporary build directory,
installs locked JavaScript dependencies from npm's offline cache, and requires
the rebuilt standalone HTML to be byte-for-byte identical.

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
McGill notice. Three.js and meshoptimizer use MIT licences. The accessible
palette uses Paul Tol's BSD 3-clause notice. The source code's
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
