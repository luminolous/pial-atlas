"""Cited anatomical navigation, not functional claims.

DK lobes: FreeSurfer CorticalParcellation wiki, 'Lobe mapping'.
https://surfer.nmr.mgh.harvard.edu/fswiki/CorticalParcellation
Cingulate and insula remain separate. Destrieux membership is measured DK
vertex overlap, not a claimed published Destrieux-to-lobe atlas.
"""
LOBE_SOURCE = 'https://surfer.nmr.mgh.harvard.edu/fswiki/CorticalParcellation#Lobe_mapping'
LOBES = {
    'frontal': 'superiorfrontal rostralmiddlefrontal caudalmiddlefrontal parsopercularis parstriangularis parsorbitalis lateralorbitofrontal medialorbitofrontal precentral paracentral frontalpole',
    'parietal': 'superiorparietal inferiorparietal supramarginal postcentral precuneus',
    'temporal': 'superiortemporal middletemporal inferiortemporal bankssts fusiform transversetemporal entorhinal temporalpole parahippocampal',
    'occipital': 'lateraloccipital lingual cuneus pericalcarine',
    'cingulate': 'rostralanteriorcingulate caudalanteriorcingulate posteriorcingulate isthmuscingulate',
    'insula': 'insula',
}
LOBE_IDS = {name: i + 1 for i, name in enumerate(LOBES)}
DK_LOBE = {parcel: lobe for lobe, parcels in LOBES.items() for parcel in parcels.split()}
DK_NAMES = dict(zip(
    'bankssts caudalanteriorcingulate caudalmiddlefrontal cuneus entorhinal fusiform inferiorparietal inferiortemporal isthmuscingulate lateraloccipital lateralorbitofrontal lingual medialorbitofrontal middletemporal parahippocampal paracentral parsopercularis parsorbitalis parstriangularis pericalcarine postcentral posteriorcingulate precentral precuneus rostralanteriorcingulate rostralmiddlefrontal superiorfrontal superiorparietal superiortemporal supramarginal frontalpole temporalpole transversetemporal insula'.split(),
    ['Banks of superior temporal sulcus', 'Caudal anterior cingulate cortex', 'Caudal middle frontal gyrus', 'Cuneus', 'Entorhinal cortex', 'Fusiform gyrus', 'Inferior parietal lobule', 'Inferior temporal gyrus', 'Isthmus of cingulate cortex', 'Lateral occipital cortex', 'Lateral orbitofrontal cortex', 'Lingual gyrus', 'Medial orbitofrontal cortex', 'Middle temporal gyrus', 'Parahippocampal gyrus', 'Paracentral lobule', 'Pars opercularis', 'Pars orbitalis', 'Pars triangularis', 'Pericalcarine cortex', 'Postcentral gyrus', 'Posterior cingulate cortex', 'Precentral gyrus', 'Precuneus', 'Rostral anterior cingulate cortex', 'Rostral middle frontal gyrus', 'Superior frontal gyrus', 'Superior parietal lobule', 'Superior temporal gyrus', 'Supramarginal gyrus', 'Frontal pole', 'Temporal pole', 'Transverse temporal gyrus', 'Insula']))
DESTRIEUX_NAMES = [
    'Unassigned', 'Frontomarginal gyrus and sulcus', 'Inferior occipital gyrus and sulcus', 'Paracentral lobule and sulcus', 'Subcentral gyrus and sulci', 'Transverse frontopolar gyri and sulci', 'Anterior cingulate gyrus and sulcus', 'Middle anterior cingulate gyrus and sulcus', 'Middle posterior cingulate gyrus and sulcus', 'Dorsal posterior cingulate gyrus', 'Ventral posterior cingulate gyrus', 'Cuneus', 'Inferior frontal gyrus, opercular part', 'Inferior frontal gyrus, orbital part', 'Inferior frontal gyrus, triangular part', 'Middle frontal gyrus', 'Superior frontal gyrus', 'Long insular gyrus and central insular sulcus', 'Short insular gyri', 'Middle occipital gyrus', 'Superior occipital gyrus', 'Lateral occipitotemporal gyrus (fusiform)', 'Medial occipitotemporal gyrus (lingual)', 'Parahippocampal gyrus', 'Orbital gyri', 'Angular gyrus', 'Supramarginal gyrus', 'Superior parietal lobule', 'Postcentral gyrus', 'Precentral gyrus', 'Precuneus', 'Gyrus rectus', 'Subcallosal gyrus', 'Anterior transverse temporal gyrus', 'Lateral superior temporal gyrus', 'Planum polare', 'Planum temporale', 'Inferior temporal gyrus', 'Middle temporal gyrus', 'Lateral fissure, anterior horizontal ramus', 'Lateral fissure, anterior ascending ramus', 'Lateral fissure, posterior ramus', 'Medial wall', 'Occipital pole', 'Temporal pole', 'Calcarine sulcus', 'Central sulcus', 'Marginal branch of cingulate sulcus', 'Anterior circular sulcus of insula', 'Inferior circular sulcus of insula', 'Superior circular sulcus of insula', 'Anterior transverse collateral sulcus', 'Posterior transverse collateral sulcus', 'Inferior frontal sulcus', 'Middle frontal sulcus', 'Superior frontal sulcus', 'Sulcus intermedius primus (Jensen)', 'Intraparietal and transverse parietal sulci', 'Middle occipital sulcus and lunatus sulcus', 'Superior occipital and transverse occipital sulci', 'Anterior occipital sulcus', 'Lateral occipitotemporal sulcus', 'Medial occipitotemporal and lingual sulci', 'Lateral orbital sulcus', 'Medial orbital (olfactory) sulcus', 'H-shaped orbital sulci', 'Parieto-occipital sulcus', 'Pericallosal sulcus', 'Postcentral sulcus', 'Inferior precentral sulcus', 'Superior precentral sulcus', 'Suborbital sulcus', 'Subparietal sulcus', 'Inferior temporal sulcus', 'Superior temporal sulcus', 'Transverse temporal sulcus']

# aseg integer IDs. Ventral DC is deliberately not subdivided or renamed.
SUBCORTICAL = {
    4: ('Left lateral ventricle', 'lh', 'ventricles'),
    5: ('Left inferior lateral ventricle', 'lh', 'ventricles'),
    14: ('Third ventricle', 'midline', 'ventricles'),
    15: ('Fourth ventricle', 'midline', 'ventricles'),
    43: ('Right lateral ventricle', 'rh', 'ventricles'),
    44: ('Right inferior lateral ventricle', 'rh', 'ventricles'),
    7: ('Left cerebellar white matter', 'lh', 'cerebellum'),
    8: ('Left cerebellar cortex', 'lh', 'cerebellum'),
    10: ('Left thalamus', 'lh', 'diencephalon'),
    11: ('Left caudate', 'lh', 'deep'),
    12: ('Left putamen', 'lh', 'deep'),
    13: ('Left pallidum', 'lh', 'deep'),
    16: ('Brainstem', 'midline', 'brainstem'),
    17: ('Left hippocampus', 'lh', 'deep'),
    18: ('Left amygdala', 'lh', 'deep'),
    26: ('Left nucleus accumbens', 'lh', 'deep'),
    28: ('Left ventral diencephalon', 'lh', 'diencephalon'),
    46: ('Right cerebellar white matter', 'rh', 'cerebellum'),
    47: ('Right cerebellar cortex', 'rh', 'cerebellum'),
    49: ('Right thalamus', 'rh', 'diencephalon'),
    50: ('Right caudate', 'rh', 'deep'),
    51: ('Right putamen', 'rh', 'deep'),
    52: ('Right pallidum', 'rh', 'deep'),
    53: ('Right hippocampus', 'rh', 'deep'),
    54: ('Right amygdala', 'rh', 'deep'),
    58: ('Right nucleus accumbens', 'rh', 'deep'),
    60: ('Right ventral diencephalon', 'rh', 'diencephalon'),
}
