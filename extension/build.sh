#!/bin/sh
# Builds dist/chrome (Chrome, Edge, Brave, Opera) and dist/firefox, plus zips.
# Usage: sh build.sh
set -e
cd "$(dirname "$0")"
rm -rf dist && mkdir -p dist
python3 - <<'PY'
import json, shutil
base = json.load(open('manifest.base.json'))
for target in ('chrome', 'firefox'):
    shutil.copytree('src', f'dist/{target}')
    m = dict(base)
    if target == 'chrome':
        m['background'] = {'service_worker': 'background.js', 'type': 'module'}
    else:
        m['background'] = {'scripts': ['background.js'], 'type': 'module'}
        m['browser_specific_settings'] = {'gecko': {'id': 'review@kinetix.invalid', 'strict_min_version': '115.0'}}
    json.dump(m, open(f'dist/{target}/manifest.json', 'w'), indent=2)
PY
(cd dist/chrome && zip -qr ../kinetix-review-chrome.zip .)
(cd dist/firefox && zip -qr ../kinetix-review-firefox.zip .)
echo "Built dist/kinetix-review-chrome.zip and dist/kinetix-review-firefox.zip"
