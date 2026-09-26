"""Collect real test results and remove host identifiers from the release report."""
from pathlib import Path
import json
import re
import xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parents[1]
REPORTS=ROOT/'reports'

def main():
    geometry=ET.parse(REPORTS/'geometry-tests.xml')
    suite=geometry.getroot().find('testsuite')
    suite.attrib.pop('hostname',None)
    geometry.write(REPORTS/'geometry-tests.xml',encoding='utf-8',xml_declaration=True)
    state=(REPORTS/'state-tests.txt').read_text(encoding='utf-8-sig')
    browser=json.loads((REPORTS/'browser-tests.json').read_text())
    compression=json.loads((REPORTS/'compression.json').read_text())
    build=json.loads((REPORTS/'build.json').read_text())
    alignment=json.loads((REPORTS/'alignment-metrics.json').read_text())
    assert int(suite.attrib['failures'])==0 and int(suite.attrib['errors'])==0
    assert re.search(r'# fail 0\b',state)
    assert browser['errors']==[] and browser['networkRequests']==[] and 'failure' not in browser
    summary={'geometryTestsPassed':int(suite.attrib['tests']),'stateTestsPassed':int(re.search(r'# pass (\d+)',state)[1]),'browserChecksPassed':browser['passed'],'compressionBuffersVerified':compression['descriptors'],'maximumPositionComponentErrorMm':compression['maximumPositionComponentErrorMm'],'browser':browser['browser'],'offlineFileURLVerified':True,'consoleErrors':0,'runtimeNetworkRequests':0,'viewportsVisuallyReviewed':[[1440,1000],[1280,800],[900,900],[390,844]],'spatialMontageReviewed':['sagittal -24 mm','coronal -20 mm','axial +20 mm'],'coarseAsegMaskDice':alignment['asegVsMNI2009cBrainMaskDice'],'standaloneHTMLBytes':build['bytes'],'standaloneHTMLSha256':build['sha256'],'limitations':['Affine population-template alignment, not exact sulcal correspondence or clinical validation.','The flat representation is a derived projection with a masked antipodal cap.','WebGL browser verification was performed in Chrome; other browser engines were not independently tested.'],'licenseDecision':'All requested datasets permit redistribution with retained notices. The restricted supplementary BrainCOLOR PDF is not redistributed.'}
    if (REPORTS/'clean-rebuild.json').exists():
        clean=json.loads((REPORTS/'clean-rebuild.json').read_text())
        assert clean['identical'] and clean['sha256']==build['sha256']
        summary['cleanArchiveRebuildByteIdentical']=True
    (REPORTS/'validation.json').write_text(json.dumps(summary,indent=2))
    print(json.dumps(summary,indent=2))

if __name__=='__main__':main()
