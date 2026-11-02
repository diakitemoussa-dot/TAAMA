/* Serveur de dev minimal — accepte les tuiles .gltf/.bin/.webp
   et gère la revalidation HTTP (ETag/Last-Modified) pour éviter de
   retélécharger les textures partagées à chaque tuile. */
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = __dirname;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

/* Variables d'environnement depuis .env (NOTION_TOKEN, NOTION_PLAYERS_DB…) — fichier jamais versionné */
try {
  for (const line of fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch (_) { /* pas de .env : l'enregistrement des joueurs dans Notion reste simplement désactivé */ }

/* POST /api/players : enregistre le joueur dans la base Notion (la clé reste côté serveur) */
function handlePlayers(req, res) {
  const json = (status, obj) => {
    const h = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
    if (process.env.ALLOWED_ORIGIN) {
      h['Access-Control-Allow-Origin'] = process.env.ALLOWED_ORIGIN;
      h['Access-Control-Allow-Headers'] = 'Content-Type';
      h['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    }
    res.writeHead(status, h);
    res.end(JSON.stringify(obj));
  };
  if (req.method === 'OPTIONS') return json(204, {});
  if (req.method !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });
  let raw = '';
  let tooBig = false;
  req.on('data', (c) => { raw += c; if (raw.length > 5000) { tooBig = true; req.destroy(); } });
  req.on('end', () => {
    if (tooBig) return;
    import('./server/players-handler.mjs')
      .then((m) => m.upsertPlayer(raw, process.env))
      .then((r) => json(r.status, r.json))
      .catch(() => json(500, { ok: false, error: 'server_error' }));
  });
}

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/api/players') { handlePlayers(req, res); return; }
  if (p === '/') p = '/index.html';
  const fp = path.join(root, p);

  if (!fp.startsWith(root)) { res.writeHead(403); res.end('403'); return; }
  // Jamais de fichiers cachés (.env, .git…) ni de code serveur par le web
  if (p.split('/').some((seg) => seg.startsWith('.')) || p.startsWith('/server/')) { res.writeHead(404); res.end('404'); return; }

  fs.stat(fp, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end('404'); return; }

    const etag = `"${st.size.toString(16)}-${st.mtimeMs.toString(16)}"`;
    const lastMod = st.mtime.toUTCString();
    const headers = {
      'Content-Type': types[path.extname(fp).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',        // revalide, mais 304 si rien n'a changé
      'ETag': etag,
      'Last-Modified': lastMod,
    };

    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers);
      res.end();
      return;
    }

    res.writeHead(200, { ...headers, 'Content-Length': st.size });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(fp).pipe(res);
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log('déjà lancé — http://localhost:8123');
    process.exit(0);
  }
  console.error(err);
  process.exit(1);
});

server.listen(8123, () => console.log('up — http://localhost:8123'));
