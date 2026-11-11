"""Build a single double-clickable file: dist/Pocket-Budget.html (no server needed).
Usage: python build.py   (needs Node.js for npx esbuild)"""
import base64, os, re, subprocess, tempfile
root = os.path.dirname(os.path.abspath(__file__))
out_js = os.path.join(tempfile.gettempdir(), 'pocket-budget.bundle.js')
subprocess.run('npx -y esbuild@0.24.0 js/app.js --bundle --format=iife --minify --outfile="%s"' % out_js, shell=True, check=True, cwd=root)
html = open(os.path.join(root, 'index.html'), encoding='utf-8').read()
css = open(os.path.join(root, 'styles.css'), encoding='utf-8').read()
js = open(out_js, encoding='utf-8').read().replace('</script', '<\\/script')
icon = 'data:image/svg+xml;base64,' + base64.b64encode(open(os.path.join(root, 'icons/icon.svg'), 'rb').read()).decode()
html = re.sub(r'\s*<link rel="manifest"[^>]*>', '', html)
html = re.sub(r'\s*<link rel="apple-touch-icon"[^>]*>', '', html)
html = html.replace('icons/icon.svg', icon)
html = html.replace('<link rel="stylesheet" href="styles.css">', '<style>\n' + css + '\n</style>')
html = html.replace('<script type="module" src="js/app.js"></script>', '<script>\n' + js + '\n</script>')
os.makedirs(os.path.join(root, 'dist'), exist_ok=True)
dest = os.path.join(root, 'dist', 'Pocket-Budget.html')
open(dest, 'w', encoding='utf-8').write(html)
print('Built', dest, round(len(html) / 1024), 'KB')
