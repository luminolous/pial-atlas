"""Download only reviewed, redistributable inputs; keep raw data in ignored .cache.

Usage: python pipeline/fetch.py
Licence decisions: docs/DATA_SOURCES.md. SHA256s are recorded and checked on reruns.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / '.cache' / 'raw'
FS = 'https://surfer.nmr.mgh.harvard.edu/pub/dist/freesurfer/tutorial_versions_centos6/freesurfer/'
TF = 'https://templateflow.s3.amazonaws.com/tpl-MNI152NLin2009cAsym/'
CBIG = 'https://raw.githubusercontent.com/ThomasYeoLab/CBIG/master/stable_projects/brain_parcellation/Yeo2011_fcMRI_clustering/1000subjects_reference/'
FILES = {}
for hemi in ['lh', 'rh']:
    for surface in ['pial', 'white', 'inflated', 'sphere', 'sphere.reg', 'sulc']:
        FILES[f'{hemi}.{surface}'] = (FS + f'subjects/fsaverage5/surf/{hemi}.{surface}', 'FreeSurfer')
    for scheme in ['aparc', 'aparc.a2009s', 'Yeo2011_7Networks_N1000', 'Yeo2011_17Networks_N1000']:
        FILES[f'{hemi}.{scheme}.annot'] = (FS + f'subjects/fsaverage5/label/{hemi}.{scheme}.annot', 'FreeSurfer; CBIG MIT for Yeo')
for name in ['aseg.mgz', 'T1.mgz', 'brainmask.mgz']:
    FILES[name] = (FS + 'subjects/fsaverage/mri/' + name, 'FreeSurfer')
FILES['FreeSurferColorLUT.txt'] = (FS + 'FreeSurferColorLUT.txt', 'FreeSurfer')
for name, suffix in [('mni-t1-2mm.nii.gz', 'T1w'), ('mni-mask-2mm.nii.gz', 'desc-brain_mask')]:
    FILES[name] = (TF + f'tpl-MNI152NLin2009cAsym_res-02_{suffix}.nii.gz', 'MNI permissive')
for n in [7, 17]:
    FILES[f'{n}NetworksOrderedNames.csv'] = (CBIG + f'{n}NetworksOrderedNames.csv', 'CBIG MIT')

LICENCES = {
    'FREESURFER.txt': 'https://surfer.nmr.mgh.harvard.edu/fswiki/FreeSurferSoftwareLicense',
    'CBIG-MIT.txt': 'https://raw.githubusercontent.com/ThomasYeoLab/CBIG/master/LICENSE.md',
    'MNI.txt': 'https://raw.githubusercontent.com/templateflow/tpl-MNI152NLin2009cAsym/master/LICENSE',
}

def get(url):
    for attempt in range(4):
        try:
            r = requests.get(url, timeout=180)
            r.raise_for_status()
            return r.content
        except requests.RequestException:
            if attempt == 3:
                raise

def main():
    RAW.mkdir(parents=True, exist_ok=True)
    (ROOT / 'licenses').mkdir(exist_ok=True)
    (ROOT / 'data').mkdir(exist_ok=True)
    manifest_path = ROOT / 'data' / 'sources.json'
    old = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    def download(item):
        name, (url, licence) = item
        path = RAW / name
        if not path.exists():
            path.write_bytes(get(url))
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if name in old and old[name]['sha256'] != digest:
            raise ValueError(f'Upstream checksum mismatch: {name}')
        print(f'{name}: {path.stat().st_size:,} bytes', flush=True)
        return name, dict(url=url, license=licence, sha256=digest, bytes=path.stat().st_size)
    manifest = dict(ThreadPoolExecutor(max_workers=6).map(download, FILES.items()))
    for name, url in LICENCES.items():
        text = get(url).decode('utf-8')
        if name == 'FREESURFER.txt':
            soup = BeautifulSoup(text, 'html.parser')
            text = (soup.select_one('#content') or soup).get_text('\n', strip=True)
            text = text[text.index('FreeSurfer Software License Agreement'):]
            text = text.split('FreeSurferSoftwareLicense (last edited')[0]
            text = 'All or portions of this licensed product (such portions are the "Software") have been obtained under license from The General Hospital Corporation and are subject to the following terms and conditions:\n\n' + text
        (ROOT / 'licenses' / name).write_text(text, encoding='utf-8')
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')

if __name__ == '__main__':
    main()
