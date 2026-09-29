# Verification record

This report describes checks performed on the delivered application and its
actual processed datasets. It is not a clinical validation or a benchmark of
anatomical accuracy in individual people.

## Automated results

| Suite | Result | Evidence |
| --- | --- | --- |
| Neuroimaging geometry, coordinate, and white-area tests | 20 passed | `reports/geometry-tests.xml` |
| State, hierarchy, visibility, lift, categorical fields, motion, and appearance | 16 passed | `reports/state-tests.txt` |
| Real-browser interaction and responsive layout checks | 15 passed | `reports/browser-tests.json` |
| New layout, rendering, motion, and contrast checks | 27 passed | `reports/polish-tests.json` |
| Appearance, paired legend, palette, and sulc shading checks | 36 passed | `reports/appearance-tests.json` |
| Compression round trip | 73 typed buffers verified | `reports/compression.json` |
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
  **99.12% / 99.83%**.
- Left / right white vertices in the undilated target mask:
  **98.51% / 99.72%**.
- Smoothed aseg mesh centroid shifts: less than **1e-10 mm** before display
  quantization; float/quantized positions have their separately tested tolerance.

## Visual review

The screenshots were inspected after the browser tests, including:

- `browser-initial.png`: the default anatomical view and desktop controls.
- `browser-inflated.png`, `browser-sphere.png`, `browser-flat.png`: preserved
  network colouring across surface targets. The flat projection's antipodal
  cap is masked to avoid triangles covering unrelated parts of the sheet.
- `browser-deep-journey.png`: deep structures in the measured group layout,
  with the source-position cortex retained as context.
- `browser-slices.png`: all three active, textured clipping planes.
- `browser-1440.png`, `browser-1280.png`, `browser-900.png`, `browser-390.png`:
  desktop, smaller desktop, tablet, and narrow/mobile layouts.
- `exported-brain.png`: the actual PNG produced by the export control.

The revised application was also exercised at **1920×1080, 1440×900, and
1280×720**. The `polish-<width>-*.png` screenshots cover the initial view,
long-list bottom, floating inspector, five surface states, display controls,
slices, every guided journey step, and the lift layout at each size. Additional
images cover 600px and 480px heights and reduced motion. The screenshot list is
recorded in `reports/polish-tests.json`.

Panel bounding boxes were checked for intersection and horizontal overflow.
The morph panel stays below the visualization. On mobile, the anatomy panel
moves below it and keeps its own scrollable list. Popovers and the guided-journey
card have explicit close controls. The camera reserves their screen space.
The journey uses its narrative card instead of the inspector while running;
its subject remains outside the card rectangle. All seven lifted group labels
and all 27 projected structure boxes are checked for collisions. A separate
unit test checks a minimum 16 mm gap between the measured 3D AABBs.

Tests also verify list reachability at the bottom of the 75-row paired Destrieux
legend, both scroll shadows, a visible footer, pinned inspector actions,
keyboard tooltips, camera/material active states, secondary-text WCAG AA
contrast, colour preservation, and reduced-motion completion. The source
label filter is independently checked to retain every named parcel. Alerts
occupy the viewer footer instead of covering the morph controls.

Issues found during validation were fixed: standalone script substitution,
aseg triangle winding, duplicate undo entries, cross-scheme inspector ancestry,
partial group-opacity depth writing, network-view labels, and antipodal flat-map
cap triangles. This revision also fixed compressed navigation, inspector
placement, source-resolution boundaries, cropped lift context, conservative
label collision estimates, continuous lift-camera updates, excessive popover
height, first-step journey framing, and footer alerts covering controls.
The final browser run reported no console errors.

## Appearance revision

The appearance suite adds 36 checks and 90 screenshots at 1920×1080 and
1280×720. Each of the four schemes is reviewed intact, with the accessible
palette, with a cortical selection, lifted, and with a selected brainstem.
The area tooltip, compact 36 px rows, per-hemisphere visibility, filter field,
tab-specific source colours, and the 2×3 camera grid are exercised. The
curvature toggle is compared on/off in all five surface states at both sizes;
interior rendered pixels verify linear luminance multipliers between 0.80 and
1.05, accounting explicitly for the half-byte uncertainty of eight-bit readback,
with the camera projection held fixed. Normalized linear-RGB channel ratios are
compared to verify chromaticity preservation. The same comparison runs for
every scheme with both palettes, and the unchanged categorical lines keep
adjacent parcels distinguishable even when source colours are similar. Across 26 rendered-pixel
comparisons, no sampled interior pixel exceeded the luminance bounds after
readback quantization was accounted for. The maximum normalized linear-RGB
channel-ratio difference was 0.007734. Camera pose and projection
were both held fixed for these comparisons. Source geometry and all label attributes remain unchanged.

Additional checks open the active-scheme chip from both tabs, confirm the native
selector opens, measure every structure row at 42 px, and compare short and
overflowing lists. The custom scrollbar is 6 px, has no arrow buttons, and
reserves no space when the list fits. Browser automation retains normal
scrollbar rendering instead of Chromium's headless hide-scrollbars default.
Home is the first button in View. Home and all six presets are checked while
tweening, after arrival, and after real pointer rotation. Opening and closing
a panel preserves a manually placed camera; automatic exploration clears the
preset highlight. Presets also clear residual rotation and pan inertia so the
view stays still after arrival. Dorsal and ventral dragging also verifies the refreshed
OrbitControls up-axis basis.

Eight independent geometry cases integrate the raw native white triangles
for all hemisphere/scheme combinations. They verify complete area accounting,
the exclusion of each scheme's medial wall, and assigned percentages summing
to 100%. Legend percentages are hemisphere percentages, not vertex fractions.

The inferior mesh seen in the baseline left lateral view was identified by
actual label-ID ray picks as **Brainstem, aseg label 16**. Its baseline opacity
was 1; the baseline screenshot is `reports/brainstem-before.png`. Its appearance
came from the lit blue-grey material. The context view
now uses an opaque, front-sided matte warm grey. Direct selection, positive
lift, and explicit Structures navigation restore the original source colour.
The diagnosis and material checks are recorded in `appearance-tests.json`.

The optional palette uses the original Paul Tol muted colours under his
BSD-3-Clause notice. Larger schemes reuse the nine colours; parcel boundaries
and names remain necessary for unambiguous identification. No dataset was
added or excluded by this revision, and imported counts remain unchanged.

## Limits

Only Chrome's engine was tested. Pinch gestures were synthesized in a browser
touch session; a physical touchscreen was not used. fsaverage6 triangulation
sets the source spatial resolution. A documented categorical display filter
smooths the boundaries and drives the corresponding picking calculation; the
original labels remain unchanged. This display is not a boundary measurement tool. Flat maps are
derived projections with a masked cap. Population-template registration is
approximate, and no clinical claims are made. Future tracts, EEG electrodes,
and connectomes were intentionally not implemented.
