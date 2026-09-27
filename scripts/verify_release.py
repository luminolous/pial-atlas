"""Rebuild the packaged application from its clean archive and compare all bytes.

Run after scripts/package_release.py. This intentionally uses npm's offline cache
and never includes raw datasets or intermediate preprocessing buffers.
"""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def main():
    cache = ROOT / '.cache'
    cache.mkdir(exist_ok=True)
    workspace = Path(tempfile.mkdtemp(prefix='release-rebuild-', dir=cache)).resolve()
    assert workspace.parent == cache.resolve()
    archive = ROOT / 'artifacts/Pial-Atlas-source-and-app.zip'
    with zipfile.ZipFile(archive) as source:
        for name in source.namelist():
            target = (workspace / name).resolve()
            if not target.is_relative_to(workspace):
                raise ValueError('The release archive contains an invalid path.')
        original = source.read('dist/Pial-Atlas.html')
        source.extractall(workspace)
    assert not (workspace / 'build').exists()
    assert not (workspace / '.cache').exists()
    npm = shutil.which('npm.cmd' if sys.platform == 'win32' else 'npm')
    if not npm:
        raise SystemExit('Node.js and npm are required to verify the release.')
    subprocess.run([npm, 'ci', '--offline', '--ignore-scripts'], cwd=workspace, check=True)
    subprocess.run([npm, 'run', 'build'], cwd=workspace, check=True)
    rebuilt = (workspace / 'dist/Pial-Atlas.html').read_bytes()
    if rebuilt != original:
        raise ValueError('The clean source archive did not reproduce the packaged HTML.')
    report = {'identical': True, 'bytes': len(rebuilt), 'sha256': hashlib.sha256(rebuilt).hexdigest(),
              'method': 'Extracted the clean release, installed package-lock.json dependencies with npm ci --offline --ignore-scripts, and rebuilt from shipped compressed assets without raw datasets or intermediate buffers.'}
    (ROOT / 'reports/clean-rebuild.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
