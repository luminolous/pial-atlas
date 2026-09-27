"""Create a clean, allowlisted release archive without downloads or dependencies."""
from pathlib import Path
import hashlib
import json
import zipfile

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'artifacts'
TOP=['README.md','LICENSE','.gitignore','package.json','package-lock.json','requirements.in','requirements.lock','pytest.ini']
DIRECTORIES=['src','pipeline','scripts','tests','data','docs','licenses','dist']
REPORTS=['build.json','alignment-metrics.json','alignment.png','compression.json','clean-rebuild.json','browser-tests.json','geometry-tests.xml','state-tests.txt','validation.json','browser-initial.png','browser-slices.png','browser-flat.png','browser-sphere.png','browser-inflated.png','browser-deep-journey.png','browser-1440.png','browser-1280.png','browser-900.png','browser-390.png','exported-brain.png']

def main():
    OUTPUT.mkdir(exist_ok=True)
    files=[ROOT/name for name in TOP]
    for directory in DIRECTORIES:
        files.extend(p for p in (ROOT/directory).rglob('*') if p.is_file() and '__pycache__' not in p.parts)
    files.extend(ROOT/'reports'/name for name in REPORTS if (ROOT/'reports'/name).exists())
    polish=ROOT/'reports/polish-tests.json'
    if polish.exists():
        files.append(polish)
        files.extend(ROOT/'reports'/name for name in json.loads(polish.read_text(encoding='utf-8')).get('screenshots',[]))
    gallery=ROOT/'reports/visual-review.html'
    if gallery.exists():files.append(gallery)
    archive=OUTPUT/'Pial-Atlas-source-and-app.zip'
    with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for file in sorted(set(files)):
            relative=file.relative_to(ROOT)
            if any(part in ['.git','.venv','.cache','node_modules','build','__pycache__'] for part in relative.parts):
                raise ValueError(f'An excluded directory reached the release allowlist: {relative}')
            z.write(file,relative.as_posix())
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        entries=z.namelist()
        assert all(not name.lower().endswith(('.mgz','.annot','.nii','.nii.gz','.mat','.pyc')) for name in entries)
        assert 'dist/Pial-Atlas.html' in entries
        for name in entries:
            if name.endswith(('.js','.mjs','.py','.md','.json','.txt','.html','.lock','.xml','.ini')):
                content=z.read(name)
                windows_prefix=bytes([67,58,92])+b'Users'+bytes([92])
                if windows_prefix in content or windows_prefix.replace(bytes([92]),bytes([47])) in content:
                    raise ValueError(f'A local machine path was found in the release: {name}')
    result={'archive':archive.name,'bytes':archive.stat().st_size,'files':len(entries),'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'rawDataExcluded':True,'dependenciesExcluded':True,'machinePathScanPassed':True}
    (OUTPUT/'release.json').write_text(json.dumps(result,indent=2))
    print(json.dumps(result,indent=2))

if __name__=='__main__':main()
