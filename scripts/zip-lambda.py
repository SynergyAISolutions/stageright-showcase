"""One-shot: zip lambda/staging-worker for Lambda deploy.
Handles Windows long paths by prefixing \\?\ when needed."""
import os
import sys
import zipfile

SRC = 'lambda/staging-worker'
DST = 'lambda/staging-worker.zip'

def long_path(p):
    abs_p = os.path.abspath(p)
    if len(abs_p) > 200 and not abs_p.startswith('\\\\?\\'):
        return '\\\\?\\' + abs_p
    return p

count = 0
skipped = 0
with zipfile.ZipFile(DST, 'w', zipfile.ZIP_DEFLATED, allowZip64=True) as zf:
    for root, dirs, files in os.walk(SRC):
        for f in files:
            full = os.path.join(root, f)
            rel = os.path.relpath(full, SRC).replace(os.sep, '/')
            try:
                zf.write(long_path(full), rel)
                count += 1
            except Exception as e:
                print(f'SKIP {rel}: {e}')
                skipped += 1

print(f'zipped={count} skipped={skipped}')
