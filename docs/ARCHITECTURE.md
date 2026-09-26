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
Pial vertices within the target mask dilated by two 2 mm voxels are 99.10% left
and 99.82% right. White vertices inside the undilated mask are 98.59% and 99.73%.
These are geometric checks, not clinical accuracy measurements.

## Surface correspondence and compression

FreeSurfer's official fsaverage5 files already provide the reduced icosahedral
resolution required for the web. The pipeline checks all four source surfaces
for exactly 10,242 vertices and identical 20,480-triangle index arrays in each
hemisphere. It does not independently decimate morph targets.

Each hemisphere has one indexed `BufferGeometry`, four per-vertex integer label
components (stored as a `vec4` attribute on the GPU), sulcal depth, persistent
visibility, and position/normal morph targets for white, inflated, sphere, and
flat representations. Geometry is never split into separate parcel meshes.
Changing parcellation updates one shader uniform. A 512-entry colour texture
maps the active label ID to a display colour.

Labels are categorical, not interpolated scalar values. GLSL `flat` varyings
use each triangle's last (provoking) vertex; ray picking reads the same indexed
vertex's label ID. Thus no interpolated value can invent a parcel ID. Boundaries
are resolved at the fsaverage5 triangle scale; this is a web visualization, not
a quantitative high-resolution parcel boundary extractor.

Meshoptimizer 0.24 compresses position buffers and index sequences. The index
sequence codec preserves exact order. Position coordinates are quantized to
0.01 mm with an actual maximum component error of 0.005 mm. Labels, masks,
sulcal depth, and the 8-bit T1 display volume are losslessly gzip-compressed.
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
Triangles incident to flagged seam-provoking vertices fade out near the final
flat state, without replacing the shared index or label buffers. Picking applies
the same seam mask. The flat state is neither an imported FreeSurfer patch nor a
metrically faithful sheet. Its camera automatically faces the sheets and fits
both hemispheres.

Hemisphere separation, sphere spacing, and deep-structure lift are animated
display offsets. The source coordinates are immutable. Slice planes always stay
in target MNI space; an explicit warning appears when display offsets or deformed
surfaces prevent anatomical comparison. **Source positions** returns the pial
surface and all offsets to zero without altering visibility rules.

## aseg extraction

The pipeline selects 21 explicitly listed tissue labels from fsaverage aseg,
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
- `src/renderer.js`: layers, Three.js rendering, shaders, morphs, picking, slices.
- `src/main.js`: accessible controls, search, inspector, labels, journey.
- `scripts/build.mjs`: mesh compression and standalone HTML packaging.
- `tests/`: geometry, compression, state, and real-browser tests.
