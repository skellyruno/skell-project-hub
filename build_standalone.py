from pathlib import Path
r=Path(__file__).resolve().parent
h=(r/'index.html').read_text(encoding='utf-8')
assert '<link rel="stylesheet" href="styles.css" />' in h
assert '<script src="seed.js"></script>' in h
assert '<script src="app.js"></script>' in h
h=h.replace('<link rel="stylesheet" href="styles.css" />', '<style>\n'+(r/'styles.css').read_text(encoding='utf-8')+'\n</style>')
for filename in ('seed.js','app.js','desktop_bridge.js'):
    js=(r/filename).read_text(encoding='utf-8')
    assert '</script' not in js.lower()
    h=h.replace(f'<script src="{filename}"></script>', '<script>\n'+js+'\n</script>')
(r/'skelly_project_hub.html').write_text(h,encoding='utf-8')
print('Standalone HTML:',len(h),'bytes')
