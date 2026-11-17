/* ==========================================================
   TAAMA — joueurs dans la feuille « Bamako Drive joueur » (onglet « Joueurs »)
   ----------------------------------------------------------
   À coller dans la feuille : Extensions → Apps Script. Puis Déployer → Application Web
   (exécuter en tant que : moi ; accès : tout le monde). Voir LISEZ-MOI.md.
   Le jeu envoie un POST (texte JSON) par profil : une ligne par appareil, identifiant en colonne B.
   Colonnes A à F = celles de « Bamako Drive joueur » ; G à L = âge, langue, temps de jeu, chapitre, séquence, découvertes.
   ========================================================== */

var SHEET_NAME = 'Joueurs';
var NOTES_SHEET = 'Notes';
var NOTES_COLUMNS = ['Date', 'Nom', 'ID appareil', 'Source', 'Note', 'ID note'];
var NOTE_SOURCE_RE = /^[a-z0-9_\-]{1,20}$/i;
var TZ = 'Africa/Bamako';
var COLUMNS = ['Nom', 'ID appareil', 'Nombre de fois', 'Première visite', 'Dernière visite', 'Appareil',
  'Âge', 'Langue', 'Temps de jeu (min)', 'Chapitre', 'Séquence', 'Découvertes'];
var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var NAME_RE = /^[\p{L}\p{N} .'\-]{1,40}$/u;
var DEVICE_RE = /^(Windows|iOS|Android|Mac|Linux|Autre) · (souris|tactile)$/;

/** Entier dans [min, max], sinon '' (case vide dans la feuille). */
function intIn(v, min, max) {
  return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= min && v <= max ? v : '';
}

/** Valide le JSON reçu. Retourne { ok, data } ou { ok:false, error }. */
function parsePayload(raw) {
  var body;
  try { body = JSON.parse(raw); } catch (err) { return { ok: false, error: 'bad_json' }; }
  if (!body || typeof body !== 'object') return { ok: false, error: 'bad_body' };
  if (typeof body.id !== 'string' || !UUID_RE.test(body.id)) return { ok: false, error: 'id_invalid' };
  var name = typeof body.name === 'string' ? body.name.replace(/\s+/g, ' ').trim() : '';
  if (!NAME_RE.test(name)) return { ok: false, error: 'name_invalid' };
  var age = intIn(Number(body.age), 1, 120);
  if (age === '') return { ok: false, error: 'age_invalid' };
  var p = body.progress && typeof body.progress === 'object' ? body.progress : {};
  var discoveries = Array.isArray(p.discoveries) ? Math.min(999, p.discoveries.length) : intIn(p.discoveries, 0, 999);
  var note = null;
  if (body.note && typeof body.note === 'object') {
    var text = typeof body.note.texte === 'string' ? body.note.texte.replace(/\s+/g, ' ').trim() : '';
    if (text.length < 1 || text.length > 300) return { ok: false, error: 'note_invalid' };
    note = {
      text: text,
      id: typeof body.note.id === 'string' && body.note.id.length <= 60 ? body.note.id : '',
      source: typeof body.note.source === 'string' && NOTE_SOURCE_RE.test(body.note.source) ? body.note.source : 'jeu'
    };
  }
  return {
    ok: true,
    data: {
      note: note,
      id: body.id,
      name: name,
      age: age,
      lang: body.lang === 'en' ? 'English' : 'Français',
      progress: {
        minutes: typeof p.playMs === 'number' && isFinite(p.playMs) && p.playMs >= 0 ? Math.round(Math.min(p.playMs, 1e10) / 60000) : '',
        chapter: intIn(p.chapter, 0, 99),
        sequence: intIn(p.sequence, 0, 99),
        discoveries: discoveries,
        newVisit: p.newVisit === true,
        deviceLabel: typeof p.deviceLabel === 'string' && DEVICE_RE.test(p.deviceLabel) ? p.deviceLabel : ''
      }
    }
  };
}

/** Empêche une cellule d'être lue comme une formule (=, +, -, @). */
function safeCell(v) {
  var s = String(v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function fmtDate(d) {
  return Utilities.formatDate(d, TZ, 'dd/MM/yyyy HH:mm:ss');
}

/** Ligne A à L. existing = ligne déjà présente (valeurs) ou null. La première visite n'est jamais réécrite. */
function buildRow(d, now, existing) {
  var prev = existing && Number(existing[2]) > 0 ? Number(existing[2]) : 0;
  var count = existing ? Math.max(1, prev + (d.progress.newVisit ? 1 : 0)) : 1;
  var first = existing && existing[3] ? existing[3] : fmtDate(now);
  var pr = d.progress;
  return [
    safeCell(d.name), d.id, count, first, fmtDate(now), safeCell(pr.deviceLabel), d.age, d.lang,
    pr.minutes, pr.chapter, pr.sequence, pr.discoveries
  ];
}

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
}

/** En-tête : écrit A à L si la feuille est vide, ajoute G à L si elles manquent. */
function ensureHeader(sh) {
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS]);
    return;
  }
  var head = sh.getRange(1, 1, 1, COLUMNS.length).getValues()[0];
  if (!head[6]) sh.getRange(1, 7, 1, 6).setValues([COLUMNS.slice(6)]);
}

/** Crée ou met à jour la ligne du joueur (recherche par identifiant en colonne B). */
function upsertPlayer(d, now) {
  var sh = getSheet();
  ensureHeader(sh);
  var last = sh.getLastRow();
  var found = -1;
  if (last >= 2) {
    var ids = sh.getRange(2, 2, last - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === d.id) { found = i; break; }
    }
  }
  if (found >= 0) {
    var row = found + 2;
    var existing = sh.getRange(row, 1, 1, COLUMNS.length).getValues()[0];
    sh.getRange(row, 1, 1, COLUMNS.length).setValues([buildRow(d, now, existing)]);
    return { created: false };
  }
  sh.getRange(last + 1, 1, 1, COLUMNS.length).setValues([buildRow(d, now, null)]);
  return { created: true };
}

/** Ajoute une note du joueur dans l'onglet « Notes » (une ligne par note ; un renvoi de la même note est ignoré). */
function addNote(d, now) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(NOTES_SHEET) || ss.insertSheet(NOTES_SHEET);
  if (sh.getLastRow() === 0) sh.getRange(1, 1, 1, NOTES_COLUMNS.length).setValues([NOTES_COLUMNS]);
  var last = sh.getLastRow();
  if (d.note.id && last >= 2) {
    var ids = sh.getRange(2, 6, last - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === d.note.id) return { duplicate: true };
  }
  sh.getRange(last + 1, 1, 1, NOTES_COLUMNS.length).setValues([[fmtDate(now), safeCell(d.name), d.id, d.note.source, safeCell(d.note.text), d.note.id]]);
  return { duplicate: false };
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Le jeu envoie ici un profil (POST). */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var parsed = parsePayload(e && e.postData ? e.postData.contents : '');
    if (!parsed.ok) return json({ ok: false, error: parsed.error });
    if (parsed.data.note) {
      var n = addNote(parsed.data, new Date());
      return json({ ok: true, note: true, duplicate: n.duplicate });
    }
    var r = upsertPlayer(parsed.data, new Date());
    return json({ ok: true, created: r.created });
  } catch (err) {
    return json({ ok: false, error: 'server_error' });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

/** Vérification : ouvrir l'adresse du script dans le navigateur affiche ceci. */
function doGet() {
  return json({ ok: true, service: 'taama-joueurs' });
}
