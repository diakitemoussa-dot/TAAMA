/**
 * Découpe djenne-ar.glb en tuiles spatiales + index.json
 * ------------------------------------------------------
 * Principe :
 *   - les meshes compacts (mosquée, murets, portes…) restent entiers dans `core.glb`
 *     (chargé en premier, il contient les noms attendus par le jeu) ;
 *   - les meshes étendus (végétation, sols lointains…) sont découpés en tuiles
 *     selon une grille XZ de CELL mètres ;
 *   - les textures sont extraites une seule fois dans `textures/` et référencées
 *     par URI depuis chaque tuile (pas de duplication dans les .glb) ;
 *   - chaque tuile est recompressée en Draco (téléchargements légers).
 *
 * Usage : node tools/split-tiles.mjs [--cell 64] [--out assets/models/tiles]
 */
import fs from 'node:fs';
import path from 'node:path';
import { Document, NodeIO, Format } from '@gltf-transform/core';
import { KHRDracoMeshCompression, EXTTextureWebP } from '@gltf-transform/extensions';
import { copyToDocument, createDefaultPropertyResolver, prune, draco } from '@gltf-transform/functions';
import draco3d from 'draco3d';

/* ---------- options ---------- */
const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 ? argv[i + 1] : def;
};
const SRC = arg('src', 'assets/models/djenne-ar.glb');
const OUT = arg('out', 'assets/models/tiles');
const CELL = Number(arg('cell', 64));
const ATOMIC_SPAN = Number(arg('atomic', 110)); // en dessous : mesh gardé entier
const ALWAYS = /Cloud|Sky|Sphere|Plane\.012/i;  // toujours dans core (ciel, nuages, fond)

const decoder = await draco3d.createDecoderModule({});
const encoder = await draco3d.createEncoderModule({});
const io = new NodeIO()
  .registerExtensions([KHRDracoMeshCompression, EXTTextureWebP])
  .registerDependencies({ 'draco3d.decoder': decoder, 'draco3d.encoder': encoder });
const ioOut = new NodeIO()
  .registerExtensions([KHRDracoMeshCompression, EXTTextureWebP])
  .registerDependencies({ 'draco3d.decoder': decoder, 'draco3d.encoder': encoder });

console.log(`Lecture de ${SRC}…`);
const doc = await io.read(SRC);
const root = doc.getRoot();
const srcScene = root.listScenes()[0];

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(path.join(OUT, 'textures'), { recursive: true });

/* ---------- 1. textures externalisées (partagées par toutes les tuiles) ---------- */
let nTex = 0;
for (const tex of root.listTextures()) {
  const image = tex.getImage();
  if (!image) continue;
  const mime = tex.getMimeType() || 'image/png';
  const ext = mime.split('/')[1].replace('jpeg', 'jpg');
  const name = `tex_${String(nTex).padStart(2, '0')}.${ext}`;
  fs.writeFileSync(path.join(OUT, 'textures', name), image);
  tex.setURI(`textures/${name}`);
  nTex++;
}
console.log(`${nTex} texture(s) extraites dans ${path.join(OUT, 'textures')}`);

/* ---------- 2. classification des meshes ---------- */
function worldBox(mesh, M) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const prim of mesh.listPrimitives()) {
    const acc = prim.getAttribute('POSITION');
    if (!acc || !acc.getMin || !acc.getMax) continue;
    const mn = acc.getMin([]), mx = acc.getMax([]);
    for (let i = 0; i < 8; i++) {
      const x = i & 1 ? mx[0] : mn[0];
      const y = i & 2 ? mx[1] : mn[1];
      const z = i & 4 ? mx[2] : mn[2];
      const wx = M[0] * x + M[4] * y + M[8] * z + M[12];
      const wy = M[1] * x + M[5] * y + M[9] * z + M[13];
      const wz = M[2] * x + M[6] * y + M[10] * z + M[14];
      if (wx < min[0]) min[0] = wx; if (wx > max[0]) max[0] = wx;
      if (wy < min[1]) min[1] = wy; if (wy > max[1]) max[1] = wy;
      if (wz < min[2]) min[2] = wz; if (wz > max[2]) max[2] = wz;
    }
  }
  return { min, max };
}

const jobs = [];
for (const node of root.listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const M = node.getWorldMatrix().slice();
  const b = worldBox(mesh, M);
  const spanX = b.max[0] - b.min[0];
  const spanZ = b.max[2] - b.min[2];
  const name = mesh.getName() || node.getName() || 'mesh';
  const atomic = ALWAYS.test(name) || (spanX <= ATOMIC_SPAN && spanZ <= ATOMIC_SPAN);
  jobs.push({ node, mesh, M, atomic, name, spanX, spanZ });
  console.log(`  ${atomic ? 'CORE ' : 'TUILE'}  ${name.padEnd(38)} ${String(Math.round(spanX)).padStart(4)}×${String(Math.round(spanZ)).padStart(4)} m`);
}
if (srcScene.listChildren().length) console.log(` (${jobs.length} meshes)`);

/* ---------- 3. helpers tuiles ---------- */
function makeTile(id) {
  const tdoc = new Document();
  const buffer = tdoc.createBuffer();
  tdoc.createScene(id);
  tdoc.createExtension(EXTTextureWebP).setRequired(true);
  return {
    id, doc: tdoc, buffer,
    nodes: new Map(), materials: new Map(), bySource: new Map(),
    resolve: createDefaultPropertyResolver(tdoc, doc),
    bbox: { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] },
    tris: 0,
  };
}
const tiles = new Map();
function tile(id) {
  if (!tiles.has(id)) tiles.set(id, makeTile(id));
  return tiles.get(id);
}

/** Matrice normale (inverse transposée de la partie 3×3). */
function normalMatrix(M) {
  const a = M[0], b = M[4], c = M[8];
  const d = M[1], e = M[5], f = M[9];
  const g = M[2], h = M[6], i = M[10];
  const A = e * i - f * h, B = f * g - d * i, C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const id = 1 / det;
  // inverse(M3) transposée ; stockage ligne-major pour notre usage
  return [
    A * id, B * id, C * id,
    (c * h - b * i) * id, (a * i - c * g) * id, (b * g - a * h) * id,
    (b * f - c * e) * id, (c * d - a * f) * id, (a * e - b * d) * id,
  ];
}

function materialFor(t, mat) {
  if (!mat) return null;
  if (t.materials.has(mat)) return t.materials.get(mat);
  const map = copyToDocument(t.doc, doc, [mat], t.resolve);
  const copy = map.get(mat) || null;
  t.materials.set(mat, copy);
  return copy;
}

/** Ajoute un sous-ensemble de triangles d'une primitive source dans une tuile. */
function addTriangles(t, nodeName, prim, attrArrays, tris, M, nm, sourceName) {
  const semantics = prim.listSemantics();
  const vertexMap = new Map();
  const out = {};

  for (const sem of semantics) {
    const { data, size } = attrArrays[sem];
    out[sem] = new data.constructor(data.length);
  }

  const pushVertex = (srcIndex) => {
    let v = vertexMap.get(srcIndex);
    if (v !== undefined) return v;
    v = vertexMap.size;
    vertexMap.set(srcIndex, v);
    for (const sem of semantics) {
      const { data, size } = attrArrays[sem];
      const dst = out[sem];
      for (let c = 0; c < size; c++) dst[v * size + c] = data[srcIndex * size + c];
    }
    return v;
  };

  const indices = [];
  for (const tri of tris) {
    indices.push(pushVertex(tri[0]), pushVertex(tri[1]), pushVertex(tri[2]));
  }
  const vcount = vertexMap.size;
  if (!vcount) return;

  const tPrim = t.doc.createPrimitive();
  for (const sem of semantics) {
    const src = prim.getAttribute(sem);
    const n = src.getElementSize();
    const arr = out[sem];

    if (sem === 'POSITION') {
      for (let v = 0; v < vcount; v++) {
        const x = arr[v * 3], y = arr[v * 3 + 1], z = arr[v * 3 + 2];
        const wx = M[0] * x + M[4] * y + M[8] * z + M[12];
        const wy = M[1] * x + M[5] * y + M[9] * z + M[13];
        const wz = M[2] * x + M[6] * y + M[10] * z + M[14];
        arr[v * 3] = wx; arr[v * 3 + 1] = wy; arr[v * 3 + 2] = wz;
        const bb = t.bbox;
        if (wx < bb.min[0]) bb.min[0] = wx;
        if (wx > bb.max[0]) bb.max[0] = wx;
        if (wy < bb.min[1]) bb.min[1] = wy;
        if (wy > bb.max[1]) bb.max[1] = wy;
        if (wz < bb.min[2]) bb.min[2] = wz;
        if (wz > bb.max[2]) bb.max[2] = wz;
      }
    } else if (sem === 'NORMAL') {
      for (let v = 0; v < vcount; v++) {
        const x = arr[v * 3], y = arr[v * 3 + 1], z = arr[v * 3 + 2];
        const nx = nm[0] * x + nm[3] * y + nm[6] * z;
        const ny = nm[1] * x + nm[4] * y + nm[7] * z;
        const nz = nm[2] * x + nm[5] * y + nm[8] * z;
        const l = Math.hypot(nx, ny, nz) || 1;
        arr[v * 3] = nx / l; arr[v * 3 + 1] = ny / l; arr[v * 3 + 2] = nz / l;
      }
    } else if (sem === 'TANGENT') {
      for (let v = 0; v < vcount; v++) {
        const x = arr[v * 4], y = arr[v * 4 + 1], z = arr[v * 4 + 2];
        const nx = M[0] * x + M[4] * y + M[8] * z;
        const ny = M[1] * x + M[5] * y + M[9] * z;
        const nz = M[2] * x + M[6] * y + M[10] * z;
        const l = Math.hypot(nx, ny, nz) || 1;
        arr[v * 4] = nx / l; arr[v * 4 + 1] = ny / l; arr[v * 4 + 2] = nz / l;
      }
    }
    tPrim.setAttribute(sem, t.doc.createAccessor().setType(src.getType()).setArray(arr).setBuffer(t.buffer));
  }

  const IndexArray = vcount > 65535 ? Uint32Array : Uint16Array;
  tPrim.setIndices(t.doc.createAccessor().setType('SCALAR').setArray(new IndexArray(indices)).setBuffer(t.buffer));

  const key = nodeName;
  let mesh = t.nodes.get(key);
  if (!mesh) {
    mesh = t.doc.createMesh(key);
    const node = t.doc.createNode(key).setMesh(mesh);
    t.doc.getRoot().listScenes()[0].addChild(node);
    t.nodes.set(key, mesh);
    t.bySource.set(sourceName, node);
  }
  const mat = materialFor(t, prim.getMaterial());
  if (mat) tPrim.setMaterial(mat);
  mesh.addPrimitive(tPrim);
  t.tris += tris.length;
}

/* ---------- 4. découpage ---------- */
for (const job of jobs) {
  const { mesh, M, name, atomic } = job;
  const nm = normalMatrix(M);
  let primIndex = 0;
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION');
    if (!pos) continue;
    const idx = prim.getIndices();
    const ia = idx ? idx.getArray() : null;
    const parr = pos.getArray();
    const count = idx ? idx.getCount() : pos.getCount();

    // positions monde (pour le calcul de cellule uniquement)
    const wpos = new Float32Array(pos.getCount() * 3);
    for (let v = 0; v < pos.getCount(); v++) {
      const x = parr[v * 3], y = parr[v * 3 + 1], z = parr[v * 3 + 2];
      wpos[v * 3] = M[0] * x + M[4] * y + M[8] * z + M[12];
      wpos[v * 3 + 1] = M[1] * x + M[5] * y + M[9] * z + M[13];
      wpos[v * 3 + 2] = M[2] * x + M[6] * y + M[10] * z + M[14];
    }

    const perTile = new Map();
    for (let t0 = 0; t0 < count; t0 += 3) {
      const a = ia ? ia[t0] : t0, b = ia ? ia[t0 + 1] : t0 + 1, c = ia ? ia[t0 + 2] : t0 + 2;
      let cx, cz;
      if (atomic) {
        cx = 0; cz = 0;
      } else {
        cx = (wpos[a * 3] + wpos[b * 3] + wpos[c * 3]) / 3;
        cz = (wpos[a * 3 + 2] + wpos[b * 3 + 2] + wpos[c * 3 + 2]) / 3;
      }
      const gx = Math.floor(cx / CELL), gz = Math.floor(cz / CELL);
      const key = atomic ? 'core' : `tile_${gx}_${gz}`;
      let list = perTile.get(key);
      if (!list) { list = []; perTile.set(key, list); }
      list.push([a, b, c]);
    }

    // tableaux d'attributs source (une seule lecture par primitive)
    const attrArrays = {};
    for (const sem of prim.listSemantics()) {
      const acc = prim.getAttribute(sem);
      attrArrays[sem] = { data: acc.getArray(), size: acc.getElementSize(), count: acc.getCount() };
    }

    for (const [id, tris] of perTile) {
      const t = tile(id);
      const nodeName = atomic
        ? `${name}${primIndex ? '_' + primIndex : ''}`
        : `${name}@${id}`;
      addTriangles(t, nodeName, prim, attrArrays, tris, M, nm, job.node.getName() || name);
    }
    primIndex++;
  }
}

/* ---------- 5. animations (uniquement celles des nœuds racines, ex. nuages) ---------- */
const coreTile = tiles.get('core');
if (coreTile) {
  const rootNodes = new Set(srcScene.listChildren().map((n) => n.getName()));
  for (const anim of root.listAnimations()) {
    const tAnim = coreTile.doc.createAnimation(anim.getName() || 'anim');
    let channels = 0;
    for (const ch of anim.listChannels()) {
      const srcNode = ch.getTargetNode();
      if (!srcNode) continue;
      // On ne recopie que les nœuds racines (parent = scène) : la transformation
      // monde a été bakée dans la géométrie, les canaux restent donc valides.
      if (srcNode.getParentNode() || !rootNodes.has(srcNode.getName())) continue;
      // Seule la translation est recopiée : la rotation/échelle de repos est déjà
      // bakée dans la géométrie, la rejouer la multiplierait.
      if (ch.getTargetPath() !== 'translation') continue;
      const target = coreTile.bySource.get(srcNode.getName());
      if (!target) continue;
      const s = ch.getSampler();
      if (!s) continue;
      const input = coreTile.doc.createAccessor()
        .setType('SCALAR').setArray(s.getInput().getArray().slice()).setBuffer(coreTile.buffer);
      const output = coreTile.doc.createAccessor()
        .setType(s.getOutput().getType()).setArray(s.getOutput().getArray().slice()).setBuffer(coreTile.buffer);
      const sampler = coreTile.doc.createAnimationSampler()
        .setInput(input).setOutput(output).setInterpolation(s.getInterpolation());
      tAnim.addSampler(sampler);
      tAnim.addChannel(
        coreTile.doc.createAnimationChannel()
          .setTargetNode(target)
          .setTargetPath(ch.getTargetPath())
          .setSampler(sampler),
      );
      channels++;
    }
    if (!channels) tAnim.dispose();
  }
}

/* ---------- 6. écriture + index ---------- */
const manifest = { version: 1, source: path.basename(SRC), cell: CELL, generated: new Date().toISOString(), tiles: [] };

for (const t of tiles.values()) {
  if (t.bbox.min[0] === Infinity) continue;
  await t.doc.transform(prune());
  try {
    // Le cœur (mosquée) garde une précision élevée ; les tuiles de décor sont plus légères.
    const q = t.id === 'core'
      ? { quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }
      : { quantizePosition: 12, quantizeNormal: 8, quantizeTexcoord: 11 };
    await t.doc.transform(draco(q));
  } catch (e) {
    console.warn(`  Draco impossible sur ${t.id}: ${e.message}`);
  }
  const file = `${t.id}.gltf`;
  const { json, resources } = await ioOut.writeJSON(t.doc, { format: Format.GLTF, basename: t.id });
  fs.writeFileSync(path.join(OUT, file), JSON.stringify(json));
  for (const [uri, data] of Object.entries(resources)) {
    if (uri.startsWith('textures/')) continue; // déjà écrites une seule fois
    fs.writeFileSync(path.join(OUT, uri), Buffer.from(data));
  }
  const binPath = path.join(OUT, `${t.id}.bin`);
  const bytes = fs.statSync(path.join(OUT, file)).size + (fs.existsSync(binPath) ? fs.statSync(binPath).size : 0);
  const center = [
    (t.bbox.min[0] + t.bbox.max[0]) / 2,
    (t.bbox.min[1] + t.bbox.max[1]) / 2,
    (t.bbox.min[2] + t.bbox.max[2]) / 2,
  ];
  const radius = Math.hypot(
    (t.bbox.max[0] - t.bbox.min[0]) / 2,
    (t.bbox.max[1] - t.bbox.min[1]) / 2,
    (t.bbox.max[2] - t.bbox.min[2]) / 2,
  );
  manifest.tiles.push({
    id: t.id, file, center, radius: +radius.toFixed(2),
    box: { min: t.bbox.min.map((v) => +v.toFixed(2)), max: t.bbox.max.map((v) => +v.toFixed(2)) },
    tris: t.tris, bytes,
    always: t.id === 'core',
    priority: t.id === 'core' ? 0 : 1,
  });
}
manifest.tiles.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(manifest, null, 1));

const total = manifest.tiles.reduce((s, t) => s + t.bytes, 0);
const texBytes = fs.readdirSync(path.join(OUT, 'textures')).reduce((s, f) => s + fs.statSync(path.join(OUT, 'textures', f)).size, 0);
const coreBytes = manifest.tiles.filter((t) => t.always).reduce((s, t) => s + t.bytes, 0);
console.log(`\n${manifest.tiles.length} tuiles — ${(total / 1048576).toFixed(2)} Mo de géométrie + ${(texBytes / 1024).toFixed(0)} Ko de textures`);
console.log(`core : ${(coreBytes / 1048576).toFixed(2)} Mo — ${manifest.tiles.find((t) => t.always)?.tris || 0} triangles`);
console.log(`index : ${path.join(OUT, 'index.json')}`);
for (const t of manifest.tiles) {
  console.log(`  ${t.id.padEnd(16)} ${String(t.tris).padStart(7)} tri  ${(t.bytes / 1024).toFixed(0).padStart(6)} Ko  centre ${t.center.map((v) => Math.round(v)).join(',')}`);
}
