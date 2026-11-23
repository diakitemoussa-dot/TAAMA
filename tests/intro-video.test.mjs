// Vidéo d'intro : choix du fichier (AV1 / mobile / H.264) et préchargement en mémoire. Lancer : node --test tests/intro-video.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { CINE, pickCinematic, canPlayAV1, preloadCinematic, introPre } from '../app/intro-video.js';

test('pickCinematic : AV1 1080p par défaut, version mobile si médias allégés, H.264 sans AV1', () => {
  assert.equal(pickCinematic({ av1: true, light: false }), CINE.av1);
  assert.equal(pickCinematic({ av1: true, light: true }), CINE.light);
  assert.equal(pickCinematic({ av1: false, light: false }), CINE.h264);
  assert.equal(pickCinematic({ av1: false, light: true }), CINE.h264);   // sans AV1, même en mode allégé : le H.264 (seul lisible)
  assert.equal(pickCinematic(), CINE.av1);
});

test('canPlayAV1 : dépend de canPlayType du navigateur, jamais d\'exception', () => {
  const doc = (ans) => ({ createElement: () => ({ canPlayType: () => ans }) });
  assert.equal(canPlayAV1(doc('probably')), true);
  assert.equal(canPlayAV1(doc('maybe')), true);
  assert.equal(canPlayAV1(doc('')), false);
  assert.equal(canPlayAV1({ createElement: () => { throw new Error('x'); } }), false);
  assert.equal(canPlayAV1(null), false);
});

test('les trois fichiers de la cinématique existent et pèsent moins de 2 Mo', () => {
  for (const [k, p] of Object.entries(CINE)) {
    const path = new URL('../' + p, import.meta.url);
    assert.ok(existsSync(path), `${k} : ${p} introuvable`);
    assert.ok(statSync(path).size < 2 * 1024 * 1024, `${k} : ${p} dépasse 2 Mo`);
    assert.ok(!p.includes(' '), `${k} : pas d'espace dans le nom`);
  }
});

test('preloadCinematic : télécharge en mémoire, progresse jusqu\'à 100, une seule fois', async () => {
  const fake = new Uint8Array(100000).fill(7);
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    const half = fake.length / 2;
    let i = 0;
    return { ok: true, headers: { get: () => String(fake.length) },
      body: { getReader: () => ({ read: async () => (i++ < 2 ? { done: false, value: fake.slice((i - 1) * half, i * half) } : { done: true }) }) } };
  };
  globalThis.URL.createObjectURL = () => 'blob:fake';
  const seen = [];
  await preloadCinematic((p) => seen.push(p));
  assert.equal(introPre.state, 'ready');
  assert.equal(introPre.blobUrl, 'blob:fake');
  assert.equal(seen.at(-1), 100);
  assert.ok(seen.every((p, i) => i === 0 || p >= seen[i - 1]), 'progression croissante');
  assert.ok(seen.some((p) => p > 0 && p < 100), 'progression intermédiaire');
  await preloadCinematic(() => {});
  assert.equal(calls, 1, 'un seul téléchargement');
});
