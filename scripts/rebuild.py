"""Portable build driver; run with the Python environment containing the lockfile."""
from pathlib import Path
import argparse
import shutil
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]

def run(command):
    subprocess.run(command,cwd=ROOT,check=True)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--from-raw',action='store_true',help='Download and preprocess the checksummed source datasets.')
    parser.add_argument('--recompute-alignment',action='store_true',help='Explicitly recompute the affine registration from the source T1 volumes.')
    parser.add_argument('--test',action='store_true',help='Run the data, compression, state, and browser verification suites.')
    args=parser.parse_args()
    npm=shutil.which('npm.cmd' if sys.platform=='win32' else 'npm')
    if not npm:raise SystemExit('Node.js and npm must be installed before building the atlas.')
    if args.from_raw:
        run([sys.executable,'pipeline/fetch.py'])
        run([sys.executable,'pipeline/preprocess.py']+(['--recompute-alignment'] if args.recompute_alignment else []))
    elif args.recompute_alignment:parser.error('--recompute-alignment requires --from-raw.')
    if not (ROOT/'node_modules').exists():run([npm,'ci'])
    run([npm,'run','build'])
    if args.test:
        if (ROOT/'build/atlas.json').exists():
            run([sys.executable,'-m','pytest','tests/test_geometry.py','-q'])
            run([shutil.which('node'),'tests/compression.mjs'])
        run([npm,'test'])

if __name__=='__main__':main()
