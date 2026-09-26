# Verification record

This report describes checks performed on the delivered application and its
actual processed datasets. It is not a clinical validation or a benchmark of
anatomical accuracy in individual people.

## Automated results

| Suite | Result | Evidence |
| --- | --- | --- |
| Neuroimaging geometry and coordinate tests | 12 passed | `reports/geometry-tests.xml` |
| State, hierarchy, persistent visibility, opacity, and undo | 7 passed | `reports/state-tests.txt` |
| Real-browser interaction and responsive layout checks | 15 passed | `reports/browser-tests.json` |
| Compression round trip | 61 typed buffers verified | `reports/compression.json` |
| Maximum coordinate component quantization error | 0.005 mm | `reports/compression.json` |
| Runtime HTTP requests with the browser offline | 0 | `reports/browser-tests.json` |
| JavaScript / WebGL console errors | 0 | `reports/browser-tests.json` |
| Build from the extracted clean source archive | Byte-for-byte identical HTML | `reports/clean-rebuild.json` |

The application was opened directly from `file://` in Chrome 153.0.8010.50 with
networking explicitly disabled. No file-access or web-security override was
needed. The exact build byte count and SHA-256 are in `reports/build.json` and
the consolidated `reports/validation.json`.

The geometry tests verify source SHA-256s, finite coordinates, valid indices,
nondegenerate triangles, positive closed aseg meshes, shared topology across
all morph states, per-vertex coverage in all four schemes, the explicit affine
mapping, source lobe membership, measured Destrieux overlap, unchanged volume
sampling, actual imported counts, and smoothing centroid preservation.

The browser suite exercises the progressive hierarchy and inspector, searches
across schemes, selects actual label IDs and separate aseg meshes, hides a
parcel through all morph/scheme/material/layout combinations, tests group opacity
and undo, verifies all camera presets, drags the model, uses wheel zoom and an
actual two-touch pinch gesture, moves/reverses all three clipping planes,
verifies slice textures and coordinates, changes legends and labels, rotates
automatically, exports a PNG, enters/exits fullscreen, runs the full guided
journey, and reads the embedded licence notices.

## Spatial alignment

The independent Python montage in `reports/alignment.png` overlays exact mesh
intersection contours on the T1 volume at sagittal x = -24 mm, coronal y = -20 mm,
and axial z = +20 mm. Pial contours are orange, white contours are cyan, and aseg
contours are green. The lower row shows the initial published affine; the upper
row shows the saved T1-derived affine refinement.

Visual inspection confirmed the shared orientation and broad cortical/deep
anatomical position in all three planes. Cortical and tissue-boundary differences
remain between population templates. The refinement is an affine transform,
not a nonlinear warp and not an exact registration of every sulcus.

Measured coarse checks:

- aseg versus target brain-mask Dice: **0.880964**. These are different types of
  mask, so this is only a coarse overlap measure.
- Left / right pial vertices in the target mask dilated by two 2 mm voxels:
  **99.10% / 99.82%**.
- Left / right white vertices in the undilated target mask:
  **98.59% / 99.73%**.
- Smoothed aseg mesh centroid shifts: less than **1e-10 mm** before display
  quantization; float/quantized positions have their separately tested tolerance.

## Visual review

The screenshots were inspected after the browser tests, including:

- `browser-initial.png`: the default anatomical view and desktop controls.
- `browser-inflated.png`, `browser-sphere.png`, `browser-flat.png`: preserved
  network colouring across surface targets. The flat projection's antipodal
  cap is masked to avoid triangles covering unrelated parts of the sheet.
- `browser-deep-journey.png`: deep structures lifted above the glass cortex.
- `browser-slices.png`: all three active, textured clipping planes.
- `browser-1440.png`, `browser-1280.png`, `browser-900.png`, `browser-390.png`:
  desktop, smaller desktop, tablet, and narrow/mobile layouts.
- `exported-brain.png`: the actual PNG produced by the export control.

Panel bounding boxes were checked for intersection and horizontal overflow.
The morph panel stays below the visualization. On mobile, the anatomy panel
moves below it and keeps its own scrollable list. Popovers and the guided-journey
card intentionally overlay the viewport and have explicit close controls.

Issues found during validation were fixed: standalone script substitution,
aseg triangle winding, duplicate undo entries, cross-scheme inspector ancestry,
partial group-opacity depth writing, network-view labels, and antipodal flat-map
cap triangles. The final browser run reported no console errors.

## Limits

Only Chrome's engine was tested. Pinch gestures were synthesized in a browser
touch session; a physical touchscreen was not used. fsaverage5 triangulation
sets the spatial resolution of both rendering and picking. Flat maps are
derived projections with a masked cap. Population-template registration is
approximate, and no clinical claims are made. Future tracts, EEG electrodes,
and connectomes were intentionally not implemented.
