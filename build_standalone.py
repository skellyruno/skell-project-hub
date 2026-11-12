from pathlib import Path
r=Path(__file__).resolve().parent
h=(r/'index.html').read_text(encoding='utf-8')
assert '<link rel="stylesheet" href="styles.css" />' in h
assert '<script src="seed.js"></script>' in h
assert '<script src="app.js"></script>' in h
for filename in ('styles.css','dev_center.css'):
    h=h.replace(f'<link rel="stylesheet" href="{filename}" />', '<style>\n'+(r/filename).read_text(encoding='utf-8')+'\n</style>')
for filename in ('seed.js','app.js','desktop_bridge.js','dev_center.js'):
    js=(r/filename).read_text(encoding='utf-8')
    assert '</script' not in js.lower()
    h=h.replace(f'<script src="{filename}"></script>', '<script>\n'+js+'\n</script>')
(r/'skelly_project_hub.html').write_text(h,encoding='utf-8')
print('Standalone HTML:',len(h),'bytes')
