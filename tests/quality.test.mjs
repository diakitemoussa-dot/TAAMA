/**
 * Tests de la logique pure de qualité : palier appareil, GPU, résolution dynamique,
 * budget de tuiles, réseau (classification, hystérésis, estimation du débit, combinaison).
 * Usage : node --test tests/quality.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pickQualityDetail, isWeakGpu, createDynamicRes, tileBudget, QUALITY_PRESETS,
  classifyNet, createNetTracker, estimateMbps, netPlan, combineQuality, modelVariantUrls, cityCandidates,
} from '../app/device-quality.js';

test('palier : ordinateur = high, raison fournie', () => {
  const d = pickQualityDetail({ coarsePointer: false, memoryGB: 2, cores: 2 });
  assert.equal(d.level, 'high'); assert.ok(d.reason.length > 0);
});
test('palier : mobile deviceMemory <= 4 ou <= 4 cœurs = low', () => {
  assert.equal(pickQualityDetail({ coarsePointer: true, memoryGB: 4, cores: 8 }).level, 'low');
  assert.equal(pickQualityDetail({ coarsePointer: true, cores: 4 }).level, 'low');
  assert.equal(pickQualityDetail({ coarsePointer: true, memoryGB: 8, cores: 8 }).level, 'mid');
});
test('palier : GPU modeste = low, GPU récent ou rendu logiciel = mid', () => {
  for (const g of ['Mali-G52', 'Mali-T830', 'Adreno (TM) 506', 'PowerVR Rogue GE8320', 'Apple A11 GPU', 'Mali-400 MP']) assert.ok(isWeakGpu(g), g);
  for (const g of ['Adreno (TM) 740', 'Mali-G710', 'Apple A15 GPU', 'Apple GPU', 'ANGLE (Google, SwiftShader)', '', undefined]) assert.ok(!isWeakGpu(g), String(g));
  assert.equal(pickQualityDetail({ coarsePointer: true, memoryGB: 8, cores: 8, gpu: 'Mali-G52' }).level, 'low');
});
test('forcer : prioritaire', () => {
  assert.equal(pickQualityDetail({ forced: 'low', coarsePointer: false }).level, 'low');
});

test('résolution dynamique : descend sous 40 fps, remonte après 2 fenêtres stables', () => {
  const r = createDynamicRes({ min: 0.6, max: 1.5 });
  let out = null;
  for (let i = 0; i < 64 && out === null; i++) out = r.update(1 / 32);   // 32 fps pendant 2 s
  assert.equal(out, 1.25);
  // 64 fps : la remontée demande 2 fenêtres de 2 s (128 frames chacune), pas une seule
  let first = null;
  for (let i = 0; i < 128; i++) first = r.update(1 / 64) ?? first;
  assert.equal(first, null); assert.equal(r.pr, 1.25);
  let second = null;
  for (let i = 0; i < 128; i++) second = r.update(1 / 64) ?? second;
  assert.equal(second, 1.5);
});
test('résolution dynamique : plancher respecté, grosses frames ignorées, désactivée si min = 0', () => {
  const r = createDynamicRes({ min: 0.75, max: 1 });
  for (let i = 0; i < 2000; i++) r.update(1 / 10);
  assert.equal(r.pr, 0.75);
  const r2 = createDynamicRes({ min: 0.6, max: 1 });
  for (let i = 0; i < 20; i++) assert.equal(r2.update(2), null);
  const r3 = createDynamicRes({ min: 0, max: 2 });
  for (let i = 0; i < 500; i++) assert.equal(r3.update(1 / 10), null);
});

test('budget de tuiles : plus petit sur low que sur high, déchargement > chargement', () => {
  const l = tileBudget('low'), h = tileBudget('high');
  assert.ok(l.loadRadius < h.loadRadius && l.maxConcurrent < h.maxConcurrent);
  for (const k of ['low', 'mid', 'high']) assert.ok(tileBudget(k).unloadRadius > tileBudget(k).loadRadius);
  assert.deepEqual(tileBudget('?'), tileBudget('high'));
});
test('réglages : le palier low n\'a ni ombres ni vrais phares', () => {
  assert.equal(QUALITY_PRESETS.low.shadows, false); assert.equal(QUALITY_PRESETS.low.headlights, false);
  assert.equal(QUALITY_PRESETS.high.shadowSize, 4096);   // le PC garde sa qualité d'origine
  assert.equal(QUALITY_PRESETS.high.shadowType, 'pcfsoft');
});

test('réseau : classification débit -> palier', () => {
  assert.equal(classifyNet({ mbps: 0.8 }), 'slow');
  assert.equal(classifyNet({ mbps: 3 }), 'medium');
  assert.equal(classifyNet({ mbps: 20 }), 'fast');
  assert.equal(classifyNet({ effectiveType: '3g', downlink: 10 }), 'slow');
  assert.equal(classifyNet({ effectiveType: '2g' }), 'slow');
  assert.equal(classifyNet({ effectiveType: '4g', downlink: 10 }), 'fast');
  assert.equal(classifyNet({ effectiveType: '4g', downlink: 10, saveData: true }), 'slow');
  assert.equal(classifyNet({}), 'fast');                       // inconnu : comportement normal
});
test('réseau : hystérésis des seuils (pas de va-et-vient autour de 1,5 / 6 Mb/s)', () => {
  assert.equal(classifyNet({ mbps: 1.7 }, 'slow'), 'slow');    // reste slow tant que < 2,0
  assert.equal(classifyNet({ mbps: 2.1 }, 'slow'), 'medium');
  assert.equal(classifyNet({ mbps: 1.7 }, 'medium'), 'medium');
  assert.equal(classifyNet({ mbps: 5 }, 'fast'), 'fast');      // reste fast tant que >= 4
  assert.equal(classifyNet({ mbps: 3.9 }, 'fast'), 'medium');
  assert.equal(classifyNet({ mbps: 5 }, 'medium'), 'medium');  // monte seulement à >= 6
});
test('réseau : le suivi lisse et exige 2 verdicts concordants', () => {
  const changes = [];
  const t = createNetTracker({ onChange: (l) => changes.push(l) });
  t.push({ mbps: 10 }); assert.equal(t.level, 'fast');
  t.push({ mbps: 0.5 }); assert.equal(t.level, 'fast');        // un seul mauvais échantillon (lissé) : pas de bascule
  t.push({ mbps: 10 }); assert.equal(t.level, 'fast');
  for (let i = 0; i < 6; i++) t.push({ mbps: 0.5 });
  assert.equal(t.level, 'slow'); assert.equal(changes[changes.length - 1], 'slow');
  for (let i = 0; i < 10; i++) t.push({ mbps: 8 });
  assert.equal(t.level, 'fast');
});
test('réseau : saveData force immédiatement le palier lent', () => {
  const t = createNetTracker();
  t.push({ effectiveType: '4g', downlink: 10, saveData: true });
  assert.equal(t.level, 'slow');
});
test('réseau : estimation du débit sur transferts parallèles (temps actif, pas la somme)', () => {
  // 2 transferts de 500 Ko simultanés sur 1 s = 8 Mb/s au total
  assert.ok(Math.abs(estimateMbps([{ start: 0, end: 1000, bytes: 500000 }, { start: 0, end: 1000, bytes: 500000 }]) - 8) < 0.01);
  // séquentiels avec un trou : le trou ne compte pas
  assert.ok(Math.abs(estimateMbps([{ start: 0, end: 1000, bytes: 125000 }, { start: 5000, end: 6000, bytes: 125000 }]) - 1) < 0.01);
  assert.equal(estimateMbps([]), null);
  assert.equal(estimateMbps([{ start: 0, end: 5, bytes: 1e6 }]), null);   // trop court pour être fiable
});

test('combinaison : l\'appareil décide du rendu, le plus économe des deux décide des octets', () => {
  const pcFast = combineQuality('high', 'fast');
  assert.equal(pcFast.render, 'high'); assert.equal(pcFast.bytes.tilesDir, 'tiles'); assert.equal(pcFast.bytes.lightMedia, false);
  const pcSlow = combineQuality('high', 'slow');            // PC en réseau lent : rendu intact, octets réduits
  assert.equal(pcFast.bytes.cityGlb, 'djenne-ville-leger.glb'); assert.equal(pcSlow.bytes.cityGlb, 'djenne-ville-leger-mobile.glb');
  assert.equal(pcSlow.render, 'high'); assert.equal(pcSlow.bytes.tilesDir, 'tiles-mobile');
  assert.equal(pcSlow.bytes.lightMedia, true); assert.ok(pcSlow.bytes.radiusFactor < 1);
  const lowFast = combineQuality('low', 'fast');            // téléphone faible sur wifi : rendu bas, octets déjà allégés
  assert.equal(lowFast.render, 'low'); assert.equal(lowFast.bytes.lightMedia, true); assert.equal(lowFast.bytes.speculativePreload, false);
  assert.equal(lowFast.bytes.concurrent, QUALITY_PRESETS.low.tileConcurrent);
  assert.ok(combineQuality('mid', 'slow').bytes.concurrent <= 2);
  const pcMedium = combineQuality('high', 'medium');       // PC en réseau moyen : mêmes assets, seulement un streaming plus prudent
  assert.equal(pcMedium.bytes.cityGlb, 'djenne-ville-leger.glb'); assert.equal(pcMedium.bytes.tilesDir, 'tiles'); assert.equal(pcMedium.bytes.lightMedia, false);
  assert.equal(pcMedium.bytes.speculativePreload, false);
  assert.equal(netPlan('slow').speculativePreload, false);
  assert.equal(netPlan('fast').speculativePreload, true);
});

test('réseau : downlink de navigator.connection (peu fiable) = seuils plus indulgents', () => {
  assert.equal(classifyNet({ effectiveType: '4g', downlink: 1.35 }), 'medium');   // jamais « lent » à tort sur un bon réseau
  assert.equal(classifyNet({ effectiveType: '4g', downlink: 0.5 }), 'slow');
  assert.equal(classifyNet({ effectiveType: '4g', downlink: 0.8 }, 'slow'), 'slow');
});

test('variantes mobiles : candidats (variante puis original), query conservée, PC = original seul', () => {
  assert.deepEqual(modelVariantUrls('assets/models/personnage-joueur-gadget.glb?v=4', true),
    ['assets/models/personnage-joueur-gadget-mobile.glb?v=4', 'assets/models/personnage-joueur-gadget.glb?v=4']);
  assert.deepEqual(modelVariantUrls('assets/models/droneN.glb?v=1', true), ['assets/models/droneN-mobile.glb?v=1', 'assets/models/droneN.glb?v=1']);
  assert.deepEqual(modelVariantUrls('assets/models/droneN.glb?v=1', false), ['assets/models/droneN.glb?v=1']);
  assert.deepEqual(modelVariantUrls('assets/models/drone.glb', true), ['assets/models/drone.glb']);   // pas de variante connue
  assert.deepEqual(modelVariantUrls('droneN.glb', true), ['droneN-mobile.glb', 'droneN.glb']);
});
test('ville : KTX2 > JPEG mobile > original ; sans compression GPU pas de KTX2 ; PC = original', () => {
  assert.deepEqual(cityCandidates(true, true), ['djenne-ville-leger-mobile-ktx2.glb', 'djenne-ville-leger-mobile.glb', 'djenne-ville-leger.glb']);
  assert.deepEqual(cityCandidates(true, false), ['djenne-ville-leger-mobile.glb', 'djenne-ville-leger.glb']);
  assert.deepEqual(cityCandidates(false, true), ['djenne-ville-leger.glb']);
});
test('modelLight : vrai sur appareil non high ou réseau lent, faux sur PC en bon réseau', () => {
  assert.equal(combineQuality('high', 'fast').bytes.modelLight, false);
  assert.equal(combineQuality('high', 'medium').bytes.modelLight, false);
  assert.equal(combineQuality('high', 'slow').bytes.modelLight, true);
  assert.equal(combineQuality('mid', 'fast').bytes.modelLight, true);
  assert.equal(combineQuality('low', 'fast').bytes.modelLight, true);
});
