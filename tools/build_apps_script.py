"""Bundle the shared UI into one Apps Script HTML file; no dependencies."""
from pathlib import Path

root = Path(__file__).resolve().parents[1]
html = (root / 'static/index.html').read_text()
css = (root / 'static/style.css').read_text()
js = (root / 'static/app.js').read_text()
start = js.index("  const response = await fetch(")
end = js.index('\n}', start)
js = js[:start] + '''  return new Promise((resolve, reject) => {
    google.script.run
      .withSuccessHandler(resolve)
      .withFailureHandler(error => reject(new Error(error.message || 'Ошибка Google Apps Script')))
      .libraryApi(path, method, data === undefined ? null : data);
  });''' + js[end:]
html = html.replace('<link rel="stylesheet" href="/style.css">', '<style>' + css + '</style>')
html = html.replace('<script src="/app.js"></script>', '<script>' + js + '</script>')
html = html.replace('class="brand" href="/"', 'class="brand" href="#"')
(root / 'apps-script/Index.html').write_text(html)
print('Built apps-script/Index.html')
