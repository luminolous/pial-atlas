"""Reproducible fsaverage6 / aseg / MNI2009c conversion. No synthetic anatomy.

Writes typed buffers to build/, metadata to data/, and spatial QA to reports/.
Compression and inline packaging are handled by scripts/build.mjs.
"""
from pathlib import Path
import json
import hashlib
import numpy as np
import nibabel as nib
from scipy import ndimage, sparse
from skimage.measure import marching_cubes
import SimpleITK as sitk
from anatomy import DK_LOBE, DK_NAMES, DESTRIEUX_NAMES, LOBE_IDS, LOBE_SOURCE, SUBCORTICAL

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / '.cache' / 'raw'
OUT = ROOT / 'build'
REPORTS = ROOT / 'reports'
SEED = np.array([[.9975,-.0073,.0176,-.0429],[.0146,1.0009,-.0024,1.5496],[-.0130,-.0093,.9971,1.1840],[0,0,0,1.]])
SCHEMES = [('dk','aparc','Desikan–Killiany'),('destrieux','aparc.a2009s','Destrieux'),('yeo7','Yeo2011_7Networks_N1000','Yeo 2011 · 7 networks'),('yeo17','Yeo2011_17Networks_N1000','Yeo 2011 · 17 networks')]
PALETTE = {'frontal':[125,170,192], 'parietal':[219,177,111], 'temporal':[165,148,185], 'occipital':[132,173,145], 'cingulate':[207,151,146], 'insula':[172,183,129], 'unassigned':[182,191,197]}

def apply(points, matrix):
    return points @ matrix[:3,:3].T + matrix[:3,3]

def write_array(name, a, dtype):
    a = np.ascontiguousarray(a, dtype=dtype)
    a.tofile(OUT / (name + '.bin'))
    return {'file':name+'.bin','dtype':a.dtype.str,'shape':list(a.shape),'bytes':a.nbytes}

def sitk_image(data, affine):
    # Nibabel RAS -> SimpleITK LPS; preserve voxel-axis directions.
    flip = np.diag([-1.,-1.,1.])
    spacing = np.linalg.norm(affine[:3,:3], axis=0)
    im = sitk.GetImageFromArray(np.asarray(data, np.float32).transpose(2,1,0))
    im.SetSpacing([float(x) for x in spacing])
    im.SetDirection([float(x) for x in (flip @ affine[:3,:3] / spacing).ravel()])
    im.SetOrigin([float(x) for x in flip @ affine[:3,3]])
    return im

def register(t1, target, target_mask, recompute=False):
    path = ROOT / 'data' / 'alignment.json'
    # The saved matrix is the reproducible transform for these checksummed inputs.
    if path.exists() and not recompute:
        return np.array(json.loads(path.read_text())['surfaceMNI305ToMNI2009cRAS'])
    source_tkr = t1.header.get_vox2ras_tkr()
    moving = sitk_image(t1.get_fdata(), source_tkr)
    fixed = sitk_image(target.get_fdata(), target.affine)
    fmask = sitk.Cast(sitk_image(target_mask.get_fdata(), target_mask.affine)>0, sitk.sitkUInt8)
    flip = np.diag([-1.,-1.,1.,1.])
    inv = flip @ np.linalg.inv(SEED) @ flip
    tx = sitk.AffineTransform(3)
    tx.SetMatrix(tuple(inv[:3,:3].ravel()))
    tx.SetTranslation(tuple(inv[:3,3]))
    sitk.ProcessObject.SetGlobalDefaultNumberOfThreads(1)
    reg = sitk.ImageRegistrationMethod()
    reg.SetMetricAsMattesMutualInformation(50)
    reg.SetMetricFixedMask(fmask)
    reg.SetMetricSamplingStrategy(reg.RANDOM)
    reg.SetMetricSamplingPercentage(.25, seed=20260926)
    reg.SetInterpolator(sitk.sitkLinear)
    reg.SetOptimizerAsGradientDescent(learningRate=1.0, numberOfIterations=180, convergenceMinimumValue=1e-6, convergenceWindowSize=12)
    reg.SetOptimizerScalesFromPhysicalShift()
    reg.SetShrinkFactorsPerLevel([4,2,1])
    reg.SetSmoothingSigmasPerLevel([2,1,0])
    reg.SmoothingSigmasAreSpecifiedInPhysicalUnitsOn()
    reg.SetInitialTransform(tx, inPlace=True)
    reg.Execute(fixed, moving)
    final = np.eye(4)
    final[:3,:3] = np.array(tx.GetMatrix()).reshape(3,3)
    final[:3,3] = tx.GetTranslation()
    forward = flip @ np.linalg.inv(final) @ flip
    record = {'method':'12-parameter affine mutual-information registration, fsaverage T1 (surface/tkReg RAS) to ICBM2009cAsym 2 mm T1. FreeSurfer MNI305-to-MNI152 affine initialization; SimpleITK 2.5.2. No nonlinear warp. Approximate population-template correspondence, not subject-specific sulcal registration.', 'seedSource':'https://surfer.nmr.mgh.harvard.edu/fswiki/CoordinateSystems', 'seedMNI305ToMNI152':SEED.tolist(), 'surfaceMNI305ToMNI2009cRAS':forward.tolist(), 'asegVoxelToSurfaceRAS':source_tkr.tolist(), 'targetVoxelToMNI2009cRAS':target.affine.tolist(), 'metric':float(reg.GetMetricValue()), 'stop':reg.GetOptimizerStopConditionDescription(), 'seed':20260926}
    path.write_text(json.dumps(record, indent=2))
    return forward

def smooth_fixed_centroid(vertices, faces):
    original_mean = vertices.mean(0)
    edges = np.concatenate([faces[:,[0,1]],faces[:,[1,2]],faces[:,[2,0]]])
    row = np.r_[edges[:,0],edges[:,1]]
    col = np.r_[edges[:,1],edges[:,0]]
    adjacency = sparse.coo_matrix((np.ones(len(row)),(row,col)), shape=(len(vertices),len(vertices))).tocsr()
    adjacency.data[:] = 1
    weight = sparse.diags(1 / np.asarray(adjacency.sum(1)).ravel()) @ adjacency
    v = vertices.astype(float)
    for _ in range(10):
        v += .5 * (weight @ v - v)
        v += -.53 * (weight @ v - v)
    v += original_mean - v.mean(0)
    return v

def flat_map(sphere, hemi):
    # Lambert azimuthal equal-area projection centered on lateral pole. The
    # antipodal cap / seam is flagged, never claimed to be a FreeSurfer flat patch.
    unit = sphere / np.linalg.norm(sphere,axis=1)[:,None]
    sign = -1 if hemi=='lh' else 1
    denom = np.maximum(1 + sign*unit[:,0], .008)
    k = np.sqrt(2 / denom)
    flat = np.c_[sign*110 + sign*unit[:,1]*k*49, np.zeros(len(unit)), unit[:,2]*k*49 + 8]
    return flat

def qa_alignment(hemispheres, subs, target, mask, transform, aseg):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    inv = np.linalg.inv(target.affine)
    vol = target.get_fdata()
    maskdata = mask.get_fdata()>0
    dilated = ndimage.binary_dilation(maskdata, iterations=2)
    samples = {}
    for h, data in hemispheres.items():
        p = data['pial']
        coords = apply(p, inv).T
        samples[h] = {'pialWithin4mmBrainMaskFraction':float(ndimage.map_coordinates(dilated.astype(float),coords,order=0).mean()), 'whiteWithinBrainMaskFraction':float(ndimage.map_coordinates(maskdata.astype(float),apply(data['white'],inv).T,order=0).mean())}
    # Mask overlap independently checks voxel-to-tkReg and RAS direction.
    source_mask = aseg.get_fdata()>0
    xyz = np.indices(target.shape).reshape(3,-1).T
    sourcevox = apply(apply(apply(xyz,target.affine),np.linalg.inv(transform)), np.linalg.inv(aseg.header.get_vox2ras_tkr()))
    warped = ndimage.map_coordinates(source_mask.astype(np.uint8),sourcevox.T,order=0).reshape(target.shape)>0
    dice = 2*np.count_nonzero(warped & maskdata)/(warped.sum()+maskdata.sum())
    report = {'cortex':samples,'asegVsMNI2009cBrainMaskDice':float(dice), 'interpretation':'Affine population-template fit only. aseg is not a full brain mask; Dice is a coarse overlap check. Contours must be inspected.', 'sliceCoordinatesRASmm':{'sagittal':-24,'coronal':-20,'axial':20}}
    fig, axes = plt.subplots(2,3,figsize=(15,10),facecolor='#f4f6f8')
    for axindex,(axis,world) in enumerate([(0,-24),(1,-20),(2,20)]):
        idx = int(round((world-target.affine[axis,3])/target.affine[axis,axis]))
        uv = [i for i in range(3) if i != axis]
        extent = [target.affine[uv[0],3],target.affine[uv[0],3]+2*(target.shape[uv[0]]-1),target.affine[uv[1],3],target.affine[uv[1],3]+2*(target.shape[uv[1]]-1)]
        for row in range(2):
            ax=axes[row,axindex]
            ax.imshow(np.take(vol,idx,axis=axis).T,origin='lower',cmap='gray',extent=extent,vmin=0,vmax=np.percentile(vol[maskdata],99))
            for hemi,d in hemispheres.items():
                for state,color in [('pial','#ff995f'),('white','#51d8fa')]:
                    p=d[state] if row==0 else apply(d['raw_'+state],SEED)
                    plot_contours(ax,p,d['faces'],axis,world,uv,color)
            for sub in subs:
                p=sub['_vertices'] if row==0 else apply(apply(sub['_vertices'],np.linalg.inv(transform)),SEED)
                plot_contours(ax,p,sub['_faces'],axis,world,uv,'#c0ff78')
            ax.set_title(f'{["Sagittal","Coronal","Axial"][axindex]} {world:+} mm · {"registered" if row==0 else "seed affine"}',fontsize=11)
            ax.set_xlim(extent[:2]);ax.set_ylim(extent[2:]);ax.set_aspect('equal')
    fig.suptitle('ICBM 2009c population T1 · pial (orange), white (cyan), aseg structures (green)',fontsize=14)
    fig.tight_layout()
    fig.savefig(REPORTS/'alignment.png',dpi=140)
    plt.close(fig)
    (REPORTS/'alignment-metrics.json').write_text(json.dumps(report,indent=2))
    return report

def plot_contours(ax, vertices, faces, axis, world, uv, color):
    from matplotlib.collections import LineCollection
    tris=vertices[faces]
    d=tris[:,:,axis]-world
    tris=tris[(d.min(1)<=0)&(d.max(1)>=0)]
    segments=[]
    for t in tris:
        pts=[]
        for a,b in [(0,1),(1,2),(2,0)]:
            da,db=t[a,axis]-world,t[b,axis]-world
            if da*db<0:
                pts.append((t[a]+(t[b]-t[a])*da/(da-db))[uv])
        if len(pts)==2:segments.append(pts)
    ax.add_collection(LineCollection(segments,colors=color,linewidths=.6))

def main():
    import argparse
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--recompute-alignment',action='store_true',help='Re-estimate the saved affine transform using the source volumes.')
    args=parser.parse_args()
    OUT.mkdir(exist_ok=True);REPORTS.mkdir(exist_ok=True)
    t1=nib.load(RAW/'T1.mgz');aseg=nib.load(RAW/'aseg.mgz')
    target=nib.load(RAW/'mni-t1-2mm.nii.gz');mask=nib.load(RAW/'mni-mask-2mm.nii.gz')
    transform=register(t1,target,mask,args.recompute_alignment)
    print('Registration ready',transform.tolist(),flush=True)
    meta={'version':1,'coordinateSpace':'MNI152NLin2009cAsym RAS millimetres','surfaces':[],'structures':[],'parcels':[],'schemes':[{'id':k,'name':n} for k,_,n in SCHEMES], 'lobeMappingSource':LOBE_SOURCE,'lobeIds':LOBE_IDS,'alignment':json.loads((ROOT/'data/alignment.json').read_text())}
    qa_hemi={}; nextid=1
    for hemi in ['lh','rh']:
        raw={};faces=None
        for state in ['pial','white','inflated','sphere']:
            v,f=nib.freesurfer.read_geometry(RAW/'fsaverage6'/f'{hemi}.{state}')
            assert v.shape==(40962,3)
            if faces is not None: assert np.array_equal(f,faces),f'Topology mismatch {hemi}.{state}'
            faces=f;raw[state]=v
        positions={k:apply(v,transform) for k,v in raw.items()}
        # Display only: center the inflated/spherical states around each hemisphere.
        for state in ['inflated','sphere']:
            positions[state]-=positions[state].mean(0)
            if state=='sphere':positions[state]*=.67
            positions[state]+=positions['pial'].mean(0)
        positions['flat']=flat_map(raw['sphere'],hemi)
        labels=np.zeros((40962,4),dtype=np.uint16)
        dkl,_,dkn=nib.freesurfer.read_annot(RAW/'fsaverage6'/f'{hemi}.aparc.annot')
        lobes=np.array([LOBE_IDS.get(DK_LOBE.get(dkn[x].decode(),'unassigned'),0) if x>=0 else 0 for x in dkl],np.uint8)
        for si,(scheme,file,_) in enumerate(SCHEMES):
            lab,ctab,names=nib.freesurfer.read_annot(RAW/'fsaverage6'/f'{hemi}.{file}.annot')
            assert len(lab)==40962
            lab[lab<0]=0
            for li,byte_name in enumerate(names):
                ids=np.where(lab==li)[0]
                if not len(ids):continue
                native=byte_name.decode()
                assigned=native.lower() not in ['unknown','medial_wall','corpuscallosum','freesurfer_defined_medial_wall']
                if scheme=='dk':name=DK_NAMES.get(native,'Medial wall / unassigned')
                elif scheme=='destrieux':name=DESTRIEUX_NAMES[li]
                else:name=('Network '+str(li)) if assigned else 'Medial wall / unassigned'
                if scheme.startswith('yeo') and assigned:
                    import csv
                    rows=list(csv.reader((RAW/f'{7 if scheme=="yeo7" else 17}NetworksOrderedNames.csv').read_text().splitlines()))
                    if li<len(rows):name=rows[li][1].strip()
                hist=np.bincount(lobes[ids],minlength=7)
                overlaps={key:round(float(hist[value]/len(ids)),4) for key,value in LOBE_IDS.items() if hist[value]>0}
                lobe=max(overlaps,key=overlaps.get) if overlaps else 'unassigned'
                if scheme=='dk':lobe=DK_LOBE.get(native,'unassigned')
                color=ctab[li,:3].tolist()
                if not scheme.startswith('yeo'):
                    base=np.array(PALETTE.get(lobe,PALETTE['unassigned']))
                    color=np.clip(base + ((li*7)%23-11),0,255).tolist()
                if not assigned:color=PALETTE['unassigned']
                labels[ids,si]=nextid
                meta['parcels'].append({'id':nextid,'key':f'{hemi}:{scheme}:{li}','localId':li,'nativeName':native,'name':name,'hemisphere':hemi,'scheme':scheme,'lobe':lobe,'lobeOverlap':overlaps,'assigned':assigned,'vertices':len(ids),'centroid':positions['pial'][ids].mean(0).round(3).tolist(),'color':color,'source':f'FreeSurfer fsaverage6 / {file}.annot'})
                nextid+=1
        sulc=nib.freesurfer.read_morph_data(RAW/'fsaverage6'/f'{hemi}.sulc')
        flat_edges=np.linalg.norm(positions['flat'][faces]-positions['flat'][np.roll(faces,1,axis=1)],axis=2)
        sphere_unit=raw['sphere']/np.linalg.norm(raw['sphere'],axis=1)[:,None]
        antipodal_cap=sphere_unit[:,0]*(-1 if hemi=='lh' else 1)<-.98
        seam=antipodal_cap[faces].any(1)|(flat_edges.max(1)>25)
        surface={'hemisphere':hemi,'vertices':40962,'triangles':len(faces),'index':write_array(hemi+'-index',faces,'<u4'),'positions':{k:write_array(hemi+'-'+k,v,'<f4') for k,v in positions.items()},'labels':write_array(hemi+'-labels',labels,'<u2'),'lobes':write_array(hemi+'-lobes',lobes,'u1'),'sulc':write_array(hemi+'-sulc',sulc,'<f4'),'flatSeamFaces':np.where(seam)[0].tolist()}
        meta['surfaces'].append(surface)
        qa_hemi[hemi]={'pial':positions['pial'],'white':positions['white'],'raw_pial':raw['pial'],'raw_white':raw['white'],'faces':faces}
    lut={}
    for line in (RAW/'FreeSurferColorLUT.txt').read_text().splitlines():
        parts=line.split()
        if len(parts)>=6 and parts[0].isdigit():lut[int(parts[0])]=[int(c) for c in parts[2:5]]
    seg=aseg.get_fdata(); subs=[]
    for sid,(name,hemi,group) in SUBCORTICAL.items():
        binary=seg==sid
        if not binary.any():continue
        v,f,_,_=marching_cubes(binary.astype(np.float32),.5,step_size=2,allow_degenerate=False)
        v=apply(v,aseg.header.get_vox2ras_tkr())
        v=apply(v,transform)
        original=v.copy();v=smooth_fixed_centroid(v,f)
        # Resolve winding after all transforms, including the reflected tkReg axes.
        signed_volume=np.einsum('ij,ij->i',v[f[:,0]],np.cross(v[f[:,1]],v[f[:,2]])).sum()/6
        if signed_volume<0:f=f[:,[0,2,1]]
        sub={'id':sid,'key':f'aseg:{sid}','name':name,'hemisphere':hemi,'group':group,'source':'FreeSurfer fsaverage aseg.mgz','color':lut.get(sid,[171,151,181]),'vertices':len(v),'triangles':len(f),'voxels':int(binary.sum()),'centroid':v.mean(0).round(4).tolist(),'smoothingCentroidShiftMm':float(np.linalg.norm(v.mean(0)-original.mean(0))),'positions':write_array('aseg-'+str(sid),v,'<f4'),'index':write_array('aseg-'+str(sid)+'-index',f,'<u4'),'_vertices':v,'_faces':f}
        subs.append(sub)
    report=qa_alignment(qa_hemi,subs,target,mask,transform,aseg)
    for sub in subs:
        sub.pop('_vertices');sub.pop('_faces')
    meta['structures']=subs
    vol=target.get_fdata(); inside=mask.get_fdata()>0
    scale=np.percentile(vol[inside],99.7)
    vol=np.clip(vol/scale*255,0,255).astype(np.uint8)
    meta['volume']={'name':'ICBM 2009c nonlinear asymmetric T1 population template','shape':list(vol.shape),'affine':target.affine.tolist(),'spacingMm':[2,2,2],'data':write_array('mni-t1',vol,'u1'),'windowMaxOriginal':float(scale)}
    meta['counts']={'importedSurfaceStates':8,'derivedFlatMaps':2,'corticalMeshes':2,'verticesPerHemisphere':40962,'corticalTriangles':163840,'parcels':{k:sum(p['assigned'] and p['scheme']==k for p in meta['parcels']) for k,_,_ in SCHEMES},'unassignedLabels':sum(not p['assigned'] for p in meta['parcels']),'asegStructures':len(subs),'asegTriangles':sum(s['triangles'] for s in subs)}
    (OUT/'atlas.json').write_text(json.dumps(meta,separators=(',',':')))
    (ROOT/'data/manifest.json').write_text(json.dumps({k:meta[k] for k in ['version','coordinateSpace','counts','schemes','lobeMappingSource']},indent=2))
    print(json.dumps(meta['counts'],indent=2),flush=True)
    print(json.dumps(report,indent=2),flush=True)

if __name__=='__main__':main()
