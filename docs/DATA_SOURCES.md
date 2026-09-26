# Data provenance and redistribution decisions

The application contains modified derivatives of the datasets below. Their
redistribution terms were reviewed before inclusion on 26 September 2026.
The application source is MIT-licensed; this does not replace the dataset terms.
Full notices are included in `licenses/` and embedded in the standalone HTML under
**Data & methods → Full dataset and runtime licence notices**.

| Included dataset | Origin and terms | Decision and processing |
| --- | --- | --- |
| FreeSurfer fsaverage5 pial, white, inflated, sphere, and sulcal depth | [Official FreeSurfer tutorial distribution](https://surfer.nmr.mgh.harvard.edu/pub/dist/freesurfer/tutorial_versions_centos6/freesurfer/subjects/fsaverage5/); [FreeSurfer Software License v1.0, February 2011](https://surfer.nmr.mgh.harvard.edu/fswiki/FreeSurferSoftwareLicense), Parts B and C | Redistribution and modification are permitted with the required preface, terms, and attribution. Both hemispheres are included. These are modified, quantized derivatives, not original FreeSurfer files. |
| Desikan–Killiany `aparc` and Destrieux `aparc.a2009s` | The same FreeSurfer distribution and licence. [Cortical parcellation documentation](https://surfer.nmr.mgh.harvard.edu/fswiki/CorticalParcellation) | Included as four integer label attributes per vertex across the four schemes; medial-wall and unassigned labels are retained explicitly. |
| Yeo 2011 7- and 17-network fsaverage5 annotations | [FreeSurfer label files](https://surfer.nmr.mgh.harvard.edu/pub/dist/freesurfer/tutorial_versions_centos6/freesurfer/subjects/fsaverage5/label/); [CBIG project](https://github.com/ThomasYeoLab/CBIG/tree/master/stable_projects/brain_parcellation/Yeo2011_fcMRI_clustering); [CBIG MIT licence](https://github.com/ThomasYeoLab/CBIG/blob/master/LICENSE.md) | Included. FreeSurfer redistribution terms are retained for its distributed files, and the CBIG MIT notice is also included. Network names come from CBIG's ordered-name CSVs. The 7 and 17 categories are represented independently in each hemisphere, not split into connected components. |
| fsaverage `aseg.mgz` and T1 | [Official fsaverage MRI directory](https://surfer.nmr.mgh.harvard.edu/pub/dist/freesurfer/tutorial_versions_centos6/freesurfer/subjects/fsaverage/mri/); FreeSurfer licence above | 21 tissue structures are extracted. The T1 is used only to estimate the affine alignment. Neither raw file is shipped. |
| ICBM 152 nonlinear asymmetric 2009c T1 and mask, 2 mm | [MNI dataset and terms](https://nist.mni.mcgill.ca/icbm-152-nonlinear-atlases-2009/); [McGill licence page](https://www.mcgill.ca/bic/software/tools-data-analysis/anatomical-mri/atlases/icbm152-non-linear-2009); [TemplateFlow mirror licence](https://github.com/templateflow/tpl-MNI152NLin2009cAsym/blob/master/LICENSE) | The MNI permissive notice permits use, modification, copying, and distribution with copyright retention. Included as an 8-bit display volume from TemplateFlow's already downsampled 2 mm distribution. The mask is used for registration/QA only. This is a population template, not an individual scan. |

No requested dataset was excluded because of redistribution restrictions. We did
not include the separate BrainCOLOR protocol PDF: its site restricts copying and
distribution without permission. Its text and graphics are not needed here; the
lobe mapping uses the published FreeSurfer mapping instead. This exclusion concerns
a supplementary reference document, not one of the requested datasets.

Raw datasets, download caches, original images, credentials, dependency directories,
and machine-specific paths are excluded from the deliverable ZIP. Every downloaded
input is identified by URL, byte count, and SHA-256 in `data/sources.json`.
The downloader checks these hashes on reruns and fails if a source changes.

## Actual imported counts

| Item | Count |
| --- | ---: |
| Source cortical surface states | 8: 2 hemispheres × pial, white, inflated, sphere |
| Derived flat maps | 2, computed from corresponding sphere vertices |
| Rendered cortical meshes | 2, with one shared topology each |
| Unique cortical vertices | 10,242 per hemisphere; 20,484 total |
| Cortical triangles | 20,480 per hemisphere; 40,960 total |
| Desikan–Killiany named parcels | 68: 34 per hemisphere |
| Destrieux named parcels | 148: 74 per hemisphere |
| Yeo 7-network hemisphere labels | 14: 7 per hemisphere |
| Yeo 17-network hemisphere labels | 34: 17 per hemisphere |
| Named hemisphere-specific labels across schemes | 264 |
| Additional source medial-wall / unknown / corpus-callosum labels | 10 across all schemes |
| Separate aseg structure meshes | 21 |
| aseg triangles | 50,672 |
| Display volume | 97 × 115 × 97 voxels, 2 mm isotropic |

The 21 aseg structures are bilateral thalamus, caudate, putamen, pallidum,
hippocampus, amygdala, nucleus accumbens, ventral diencephalon, cerebellar cortex,
cerebellar white matter, and one midline brainstem. The brainstem and ventral
diencephalon are not divided beyond what the source segmentation supplies.
Ventricles, choroid plexus, vessels, and cerebral white matter are not presented
as additional subcortical structures.

## Scientific references

- Fischl et al. (1999), *High-resolution intersubject averaging and a coordinate
  system for the cortical surface*. [doi:10.1002/(SICI)1097-0193(1999)8:4<272::AID-HBM10>3.0.CO;2-4](https://doi.org/10.1002/(SICI)1097-0193(1999)8:4%3C272::AID-HBM10%3E3.0.CO;2-4).
- Desikan et al. (2006), *An automated labeling system for subdividing the human
  cerebral cortex on MRI scans into gyral based regions of interest*.
  [doi:10.1016/j.neuroimage.2006.01.021](https://doi.org/10.1016/j.neuroimage.2006.01.021).
- Destrieux et al. (2010), *Automatic parcellation of human cortical gyri and sulci
  using standard anatomical nomenclature*.
  [doi:10.1016/j.neuroimage.2010.06.010](https://doi.org/10.1016/j.neuroimage.2010.06.010).
- Yeo et al. (2011), *The organization of the human cerebral cortex estimated by
  intrinsic functional connectivity*.
  [doi:10.1152/jn.00338.2011](https://doi.org/10.1152/jn.00338.2011).
- Fonov et al. (2011), *Unbiased average age-appropriate atlases for pediatric
  studies*. [doi:10.1016/j.neuroimage.2010.07.033](https://doi.org/10.1016/j.neuroimage.2010.07.033).
- Klein and Tourville (2012), *101 Labeled Brain Images and a Consistent Human
  Cortical Labeling Protocol*, the appendix cited by FreeSurfer's lobe mapping.
  [doi:10.3389/fnins.2012.00171](https://doi.org/10.3389/fnins.2012.00171).

No clinical validation is claimed. The application does not assign unsourced
functions to anatomical structures. Network names are source labels, not claims
that a selected region has an exclusive function.
