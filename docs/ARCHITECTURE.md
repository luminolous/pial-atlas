# Data and rendering architecture

## Coordinates

The application uses right-anterior-superior (RAS) millimetres throughout, with
the scene's Z axis pointing superiorly. It uses no arbitrary anatomical centering
or per-structure translation in its source-position view.

The source cortical coordinates are FreeSurfer fsaverage surface/tkReg RAS in
MNI305 space. The ICBM2009cAsym volume is in a different template space. These
coordinates are never assumed interchangeable.

The initial affine is the [FreeSurfer MNI305-to-MNI152 matrix, use case 8](https://surfer.nmr.mgh.harvard.edu/fswiki/CoordinateSystems).
It is then refined by deterministic, 12-parameter affine registration of the
fsaverage T1 to ICBM2009cAsym T1 at 2 mm. SimpleITK 2.5.2 uses Mattes mutual
information with 50 bins, 25% fixed-seed sampling (20260926), a target brain mask,
multiresolution factors 4/2/1, and one computational thread. LPS/RAS conversion
is explicit at the SimpleITK boundary. The resulting matrix is saved, not silently
re-estimated when building the application.

For column vectors, the saved surface-to-target matrix is:

```text
 1.016904384   0.003322563   0.005534240  -6.533556706
 0.012935945   1.016346650  -0.021734530   1.603421141
-0.009181527  -0.012571033   1.039451731   0.592552042
 0             0             0             1
```

The authoritative full-precision values and the source/target voxel affines are
in `data/alignment.json`. The operations are:

```text
targetRAS = surfaceToTargetRAS × surfaceVertex
targetRAS = surfaceToTargetRAS × aseg.header.get_vox2ras_tkr() × asegVoxel
targetRAS = niftiAffine × templateVoxel
```

The 2 mm target affine is diagonal with voxel scales `(2, 2, 2)` and origin
`(-96.5, -132.5, -78.5)`. Clipping planes, displayed slice coordinates, cameras,
and meshes all use this target RAS frame. Slice pixels are sampled from the
nearest 2 mm voxel plane; the plane can be placed at an integer millimetre,
so its sample-center offset is at most 1 mm.

This is an **approximate affine alignment of two population templates**. It is
not a nonlinear surface-to-volume correspondence. Fine sulci and tissue borders
do not match exactly. The QA montage shows pial, white, and aseg contours in the
three orthogonal planes, before and after affine refinement. The coarse aseg
versus target brain-mask Dice is 0.880964; aseg is not itself a full brain mask.
Pial vertices within the target mask dilated by two 2 mm voxels are 99.12% left
and 99.83% right. White vertices inside the undilated mask are 98.51% and 99.72%.
These are geometric checks, not clinical accuracy measurements.

## Surface correspondence and compression

FreeSurfer's official fsaverage6 files already provide the reduced icosahedral
resolution required for the web. The pipeline checks all four source surfaces
for exactly 40,962 vertices and identical 81,920-triangle index arrays in each
hemisphere. It does not independently decimate morph targets.

Each hemisphere retains one shared source topology and four integer label IDs
per vertex. The GPU-facing geometry expands triangle corners once to carry
barycentric coordinates, source label attributes, average convexity (sulc), visibility, and
the five corresponding positions and normals. The two cortical meshes are never
split into separate parcel meshes, and geometry remains fixed across schemes.
The 81,924 unique source vertices become 491,520 GPU triangle corners; these
derived corners are generated locally and are not duplicated in the download.

To remove staircase edges, `src/cortex.js` filters categorical indicator fields
with three adjacency passes (30% own value, 70% neighbour average). This is a
display filter, not a new anatomical parcellation: original integer annotations,
counts, lobe membership, and source coordinates remain intact. A texture stores
the four strongest candidate IDs and corner weights per triangle and scheme.
The fragment shader interpolates membership weights, selects an existing ID,
and draws a thin derivative-antialiased boundary between the two leading labels.
All named source parcels are verified to survive this display filter. Picking
evaluates the identical weights and returns the selected source ID, never RGB.
The source-label vertex footprint and the filtered categorical footprint are
both masked when a parcel is hidden, in all four schemes.

A 512-entry colour texture maps IDs to colours. A scheme switch cross-fades the
previous and current lookup for 300 ms. Selection preserves its source colour
and adds a narrow light boundary; other parcels have 35% saturation and 35%
brightness after tone mapping. Hover uses a lighter 70% treatment. The original
source geometry and all categorical fields are shared across every morph state.

Meshoptimizer 0.24 compresses position buffers and index sequences. The index
sequence codec preserves exact order. Position coordinates are quantized to
0.01 mm with an actual maximum component error of 0.005 mm. Labels, masks,
average convexity (sulc), and the 8-bit T1 display volume are losslessly gzip-compressed.
The standalone HTML embeds the compressed payload, decoder WebAssembly, Three.js,
JavaScript, CSS, and all licence notices. Nothing is loaded from a server or CDN.

## Non-anatomical states

Inflated and spherical states use the source fsaverage correspondence. They are
centered for display; the sphere radius is reduced for readable navigation.
The two flat maps are derived Lambert azimuthal projections of the source spheres,
centered on each lateral pole. They retain all vertices and the shared topology.
The closed surface has an antipodal seam/cap and distorted triangles there.
The cap is defined by lateral-pole dot product below -0.98; projected triangles
with an edge above 25 mm are also flagged.
Flagged seam triangles fade out near the final flat state without replacing
the shared source topology or label buffers. Picking applies
the same seam mask. The flat state is neither an imported FreeSurfer patch nor a
metrically faithful sheet. Its camera automatically faces the sheets and fits
both hemispheres.

Hemisphere separation, sphere spacing, and deep-structure lift are animated
display offsets. The source coordinates are immutable. Slice planes always stay
in target MNI space; an explicit warning appears when display offsets or deformed
surfaces prevent anatomical comparison. **Source positions** returns the pial
surface and all offsets to zero without altering visibility rules.

## aseg extraction

The pipeline selects 27 explicitly listed tissue and ventricular labels from fsaverage aseg,
uses marching cubes at level 0.5 with a two-voxel step, transforms to target RAS,
and applies ten Taubin smoothing pairs (`lambda=0.5`, `mu=-0.53`). The original
vertex centroid is restored after smoothing, so no mesh is translated away from
its source location. Winding is corrected using signed volume after transforms.
Every extracted mesh is checked for valid indices, nonzero triangle areas,
closed edges, finite coordinates, positive volume, and centroid preservation.

## Hierarchy and visibility

The DK-to-lobe mapping is an explicit table in `pipeline/anatomy.py`, sourced from
the FreeSurfer cortical parcellation documentation. Cingulate cortex and insula
remain separate groups. All 34 named DK labels per hemisphere are covered.
For Destrieux, the pipeline computes vertex overlap with these DK groups and
uses the largest overlap as a navigation parent. The UI discloses this derived
relationship and shows the overlap proportions, rather than claiming an official
Destrieux lobar taxonomy. Yeo labels sit under **Distributed networks**.

Lobe visibility masks use the original DK per-vertex membership, including when
another scheme is active. A hidden parcel from any scheme masks its source
vertices in every scheme. Masks are combined by intersection; a switch, material
change, isolation, or journey can never resurrect an explicitly hidden vertex.
Opacity composes by the minimum applicable ancestor opacity. Restore all is the
explicit way to clear visibility and opacity rules.

`Store` keeps immutable state snapshots for undo. Pointer slider gestures are
one history entry; duplicate input values do not consume extra entries. Reset
is undoable. Camera orbit/pan/zoom is separate from anatomical state and is not
part of the undo history.

## Layout, motion, and lifted structures

The left navigation is a viewport-height flex column. The fixed header, tabs,
breadcrumb, and footer surround a `flex: 1; min-height: 0; overflow-y: scroll`
list. Scroll shadows reflect whether more rows exist above or below. The
inspector has its own scrollable body and fixed action footer, outside navigation.
An off-axis orthographic projection reserves screen space for the inspector or
journey. The journey temporarily uses its narrative card in place of the
inspector; closing it makes the selected structure's inspector available again.
Focus calculates the selected geometry bounds and, for a parcel, faces its
outward direction so a ventral or medial selection can actually be seen.

`src/motion.js` is the only motion-token source: micro 120 ms, UI 220 ms, layout
450 ms, camera 700 ms, and the specifically requested scheme cross-fade 300 ms.
The build exports these tokens and the two easing curves into CSS. A small
internal tween map handles camera/layout/opacity transitions; no animation
dependency or runtime network request is added. CSS uses the same standard
curve, with the overshooting curve restricted to toggle knobs. Reduced motion
finishes tweens immediately and disables automatic rotation.

The lift layout measures actual transformed mesh bounds. Bilateral structures
are paired into left/right columns within seven display groups: thalamus, basal
ganglia, limbic structures, ventricles, brainstem, cerebellum, and undivided
ventral diencephalon. The last group preserves the source label rather than
misclassifying it as thalamus. Third and fourth ventricles occupy the final
ventricular row. These display groups do not replace the anatomical hierarchy.
Groups are packed into three columns with aligned headings, 16 mm minimum
within-group gaps, and 36 mm between group cells. No structure is rescaled.
At full lift, both 3D AABBs and projected rectangles are tested for overlap,
and the seven visible group labels are independently checked for collisions.
The lift is a non-anatomical layout; reducing it to zero restores every original
source position. The framing includes the cortex as anatomical context.

## Context appearance and area metadata

`src/appearance.js` groups hemisphere labels for the compact legend, assigns
the optional Paul Tol palette on the cortical adjacency graph, and decides
when a deep mesh uses source aseg colours. The renderer keeps a separate
Structures-tab context so merely displaying the root Brain list does not colour
deep tissue. None of these operations modify source IDs or hidden masks.
Palette transitions update RGB only; visibility transitions update lookup
alpha independently. Deep tissue is opaque and front-sided at full opacity,
with transparent rendering enabled during fades or explicit glass/opacity use.

The pipeline integrates native white triangles before registration, attributing
one third of each triangle's area to each corner's label. Parcel metadata
contains `whiteAreaMm2`, `cortexAreaMm2`, and `areaPercent`. The denominator is
the same hemisphere/scheme's assigned cortex. Unassigned labels retain their
measured area but have a null percentage because they are excluded.

The sulc source attribute already shares fsaverage6 vertex correspondence. A
single combined-hemisphere 95th-percentile absolute scale drives an HSL
lightness operation of up to ±18% after lighting and before selection dimming.
The Curvature shading toggle changes a uniform, without replacing geometry.

## Additional layers

`LayerRegistry` registers scene objects with an ID, coordinate-space declaration,
state update hook, and disposal hook. Anatomy and MNI slices are its initial
layers. Future tract, EEG, and connectome loaders must declare their source
coordinates and supply an explicit transform to the shared target RAS frame.
Those features and their data are not implemented in this release.

## Files

- `pipeline/fetch.py`: reviewed source URLs, licence retrieval, checksums.
- `pipeline/preprocess.py`: registration, morph correspondence, labels, aseg
  marching cubes, smoothing, volume conversion, spatial QA.
- `pipeline/anatomy.py`: cited anatomical mapping and source-label names.
- `src/state.js`: visibility, undo, hierarchy, isolation, opacity.
- `src/data.js`: offline decompression and typed array reconstruction.
- `src/renderer.js`: layers, cameras, Three.js rendering, morphs, picking, slices.
- `src/cortex.js`: categorical boundary filtering, GPU attributes, and shaders.
- `src/appearance.js`: paired area legends, accessible colours, and deep context.
- `src/lift.js`: measured display packing without moving source coordinates.
- `src/motion.js`: shared motion tokens and the internal tween utility.
- `src/brand.js`: original monoline brain glyph shared by UI, favicon, and PNG.
- `src/main.js`: accessible controls, search, inspector, labels, journey.
- `scripts/build.mjs`: mesh compression and standalone HTML packaging.
- `tests/`: geometry, compression, state, and real-browser tests.
