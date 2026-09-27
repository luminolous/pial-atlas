"""Validate actual imported neuroimaging data and transformations."""
import json
import hashlib
import sys
from pathlib import Path
import numpy as np
import nibabel as nib
import pytest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'pipeline'))
from anatomy import DK_LOBE, LOBE_IDS

META=json.loads((ROOT/'build/atlas.json').read_text())
RAW=ROOT/'.cache/raw'

def array(desc):
    return np.fromfile(ROOT/'build'/desc['file'],dtype=desc['dtype']).reshape(desc['shape'])

def test_raw_source_checksums():
    for name,source in json.loads((ROOT/'data/sources.json').read_text()).items():
        assert hashlib.sha256((RAW/name).read_bytes()).hexdigest()==source['sha256']

@pytest.mark.parametrize('hemi',['lh','rh'])
def test_shared_topology_and_vertex_correspondence(hemi):
    surface=next(s for s in META['surfaces'] if s['hemisphere']==hemi)
    index=array(surface['index'])
    assert index.shape==(81920,3)
    assert index.min()==0 and index.max()==40961
    assert 0<len(surface['flatSeamFaces'])<len(index)*.05
    for state in ['pial','white','inflated','sphere']:
        raw,faces=nib.freesurfer.read_geometry(RAW/'fsaverage6'/f'{hemi}.{state}')
        assert raw.shape==(40962,3)
        np.testing.assert_array_equal(index,faces)
        assert np.isfinite(array(surface['positions'][state])).all()
    for state,desc in surface['positions'].items():
        pos=array(desc);tri=pos[index]
        assert pos.shape==(40962,3)
        area=np.linalg.norm(np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]),axis=1)
        assert np.min(area)>1e-7,f'Degenerate triangles in {hemi}.{state}'

@pytest.mark.parametrize('hemi',['lh','rh'])
def test_explicit_surface_transform(hemi):
    surface=next(s for s in META['surfaces'] if s['hemisphere']==hemi)
    matrix=np.array(META['alignment']['surfaceMNI305ToMNI2009cRAS'])
    assert .8<np.linalg.det(matrix[:3,:3])<1.3
    for state in ['pial','white']:
        vertices,_=nib.freesurfer.read_geometry(RAW/'fsaverage6'/f'{hemi}.{state}')
        expected=vertices@matrix[:3,:3].T+matrix[:3,3]
        np.testing.assert_allclose(array(surface['positions'][state]),expected,atol=1e-5)

@pytest.mark.parametrize('hemi',['lh','rh'])
def test_every_vertex_has_every_scheme_label(hemi):
    surface=next(s for s in META['surfaces'] if s['hemisphere']==hemi)
    labels=array(surface['labels'])
    assert labels.shape==(40962,4) and np.all(labels>0)
    for si,scheme in enumerate(['dk','destrieux','yeo7','yeo17']):
        parcels=[p for p in META['parcels'] if p['scheme']==scheme and p['hemisphere']==hemi]
        assert set(np.unique(labels[:,si]))==set(p['id'] for p in parcels)
        assert sum(p['vertices'] for p in parcels)==40962
        for parcel in parcels:assert np.count_nonzero(labels[:,si]==parcel['id'])==parcel['vertices']

def test_cited_lobe_membership_and_measured_overlap():
    assert len(DK_LOBE)==34
    for surface in META['surfaces']:
        labels=array(surface['labels']);lobes=array(surface['lobes'])
        for parcel in [p for p in META['parcels'] if p['hemisphere']==surface['hemisphere']]:
            si=['dk','destrieux','yeo7','yeo17'].index(parcel['scheme'])
            vertices=labels[:,si]==parcel['id']
            if parcel['scheme']=='dk' and parcel['assigned']:
                assert parcel['lobe']==DK_LOBE[parcel['nativeName']]
                assert np.all(lobes[vertices]==LOBE_IDS[parcel['lobe']])
            for name,value in parcel['lobeOverlap'].items():
                assert abs(value-np.mean(lobes[vertices]==LOBE_IDS[name]))<=.000051

def test_aseg_geometry_integrity_winding_and_position():
    assert len(META['structures'])==27
    for structure in META['structures']:
        vertices=array(structure['positions']);faces=array(structure['index'])
        assert np.isfinite(vertices).all()
        assert faces.min()>=0 and faces.max()<len(vertices)
        assert structure['smoothingCentroidShiftMm']<1e-10
        np.testing.assert_allclose(vertices.mean(0),structure['centroid'],atol=.001)
        triangle=vertices[faces]
        assert np.linalg.norm(np.cross(triangle[:,1]-triangle[:,0],triangle[:,2]-triangle[:,0]),axis=1).min()>1e-6
        signed=np.einsum('ij,ij->i',triangle[:,0],np.cross(triangle[:,1],triangle[:,2])).sum()/6
        assert signed>0,f'Inward winding: {structure["name"]}'
        edges=np.sort(np.concatenate([faces[:,[0,1]],faces[:,[1,2]],faces[:,[2,0]]]),axis=1)
        _,counts=np.unique(edges,axis=0,return_counts=True)
        assert np.all(counts==2),f'Non-closed mesh: {structure["name"]}'

def test_surface_volume_alignment_metrics():
    metrics=json.loads((ROOT/'reports/alignment-metrics.json').read_text())
    assert metrics['asegVsMNI2009cBrainMaskDice']>.85
    for hemi in ['lh','rh']:
        assert metrics['cortex'][hemi]['pialWithin4mmBrainMaskFraction']>.98
        assert metrics['cortex'][hemi]['whiteWithinBrainMaskFraction']>.98

def test_volume_affine_and_sampling():
    volume=META['volume'];raw=nib.load(RAW/'mni-t1-2mm.nii.gz')
    assert volume['shape']==[97,115,97]
    assert volume['spacingMm']==[2,2,2]
    np.testing.assert_array_equal(volume['affine'],raw.affine)
    data=array(volume['data']);expected=np.clip(raw.get_fdata()/volume['windowMaxOriginal']*255,0,255).astype(np.uint8)
    np.testing.assert_array_equal(data,expected)

def test_actual_imported_counts():
    assert META['counts']['parcels']=={'dk':68,'destrieux':148,'yeo7':14,'yeo17':34}
    assert META['counts']['unassignedLabels']==10
    assert META['counts']['corticalTriangles']==163840
