# -*- coding: utf-8 -*-
"""Génère les fichiers audio de la voix de Tapama (voix neuronale féminine, via edge-tts) à partir de tools/.tapama-lines.json.
Chaque réplique est découpée en phrases ; chaque phrase est dite avec une vitesse, une hauteur et un volume qui dépendent de l'HUMEUR de la réplique et de la PONCTUATION
(question : voix qui monte ; exclamation : plus vive ; points de suspension : lent et grave ; fin de réplique : cadence descendante), avec des pauses entre les phrases.
Sortie : assets/audio/tapama/<clé>_<n>.mp3 + manifest.json { clé: [ {f, gap}, … ] }. Incrémental : une réplique déjà générée n'est pas refaite (option --force).
Usage : python tools/gen_tapama_voice.py [--force] [--voice fr-FR-VivienneMultilingualNeural]"""
import asyncio, json, os, re, sys
import edge_tts

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'audio', 'tapama')
VOICE = 'fr-FR-VivienneMultilingualNeural'
if '--voice' in sys.argv: VOICE = sys.argv[sys.argv.index('--voice') + 1]
FORCE = '--force' in sys.argv

# humeur -> (vitesse %, hauteur Hz, volume %, facteur de pause)
MOOD = {
    'neutre':    (0, 0, 0, 1.0),
    'curieuse':  (2, 5, 0, 1.0),
    'inquiete':  (10, 8, -4, 0.8),
    'surprise':  (8, 12, 6, 0.9),
    'attentive': (-6, -3, -6, 1.2),
    'souriante': (3, 6, 4, 1.0),
}

def clean(text):
    t = text.replace('’', "'")
    t = re.sub(r"\s*,\s*\{nom\}\s*([.!?…])", r"\1", t)            # « …, {nom}. » -> « …. »
    t = re.sub(r"\{nom\}\s*,\s*", "", t)                            # « {nom}, j'ai… » -> « j'ai… »
    t = re.sub(r"\s*,\s*\{nom\}", "", t)
    t = re.sub(r"\s*\{nom\}", "", t)                                # « Salut {nom} ! » -> « Salut ! »
    t = re.sub(r"\s+([!?.,;:…])", r"\1", t).strip()
    return t[:1].upper() + t[1:] if t else t

def phrases(t):
    parts = re.split(r"(?<=[.!?…])\s+", t)
    return [p.strip() for p in parts if p.strip()]

def fmt(v, unit):
    return ('+' if v >= 0 else '-') + str(abs(int(round(v)))) + unit

SEM = None
async def synth(text, rate, pitch, vol, path):
    for attempt in range(4):                                        # le service gratuit se fige parfois : délai d'attente + nouvelles tentatives
        try:
            async with SEM:
                await asyncio.wait_for(edge_tts.Communicate(text, VOICE, rate=fmt(rate, '%'), pitch=fmt(pitch, 'Hz'), volume=fmt(vol, '%')).save(path), timeout=40)
            return
        except asyncio.TimeoutError:
            print('  (délai dépassé, nouvelle tentative)', flush=True)
        except edge_tts.exceptions.NoAudioReceived:
            if attempt >= 3: raise
            print('  (aucun son reçu, nouvelle tentative)', flush=True); await asyncio.sleep(3)
        except Exception as e:
            print('  (erreur réseau :', type(e).__name__, ')', flush=True); await asyncio.sleep(2)
    raise edge_tts.exceptions.NoAudioReceived('abandon')

async def main():
    global SEM
    SEM = asyncio.Semaphore(4)
    lines = json.load(open(os.path.join(ROOT, 'tools', '.tapama-lines.json'), encoding='utf8'))
    os.makedirs(OUT, exist_ok=True)
    mpath = os.path.join(OUT, 'manifest.json')
    manifest = json.load(open(mpath, encoding='utf8')) if os.path.exists(mpath) else {}
    done = 0
    for L in lines:
        key = L['key']
        if key in manifest and not FORCE and all(os.path.exists(os.path.join(OUT, s['f'])) for s in manifest[key]): continue
        r0, p0, v0, gf = MOOD.get(L.get('mood'), MOOD['neutre'])
        ps = phrases(clean(L['text']))
        async def one(i, ph):
            last = i == len(ps) - 1
            r, p, v, gap = r0, p0, v0, 380
            end = ph[-1]
            if end == '?':   p += 6; r -= 2; gap = 420
            elif end == '!': p += 4; r += 6; v += 6; gap = 340
            elif end == '…': p -= 4; r -= 10; gap = 650
            if i == 0 and len(ps) > 1: p += 2                        # début de réplique plus vivant
            if last and end == '.': p -= 3; r -= 3                  # cadence descendante en fin de réplique
            fn = f"{key}_{i}.mp3"
            if not re.search(r'\w', ph): return None               # rien à dire (ponctuation seule)
            try:
                await synth(ph, r, p, v, os.path.join(OUT, fn))
            except edge_tts.exceptions.NoAudioReceived:
                try: await synth(ph, 0, 0, 0, os.path.join(OUT, fn))
                except edge_tts.exceptions.NoAudioReceived:
                    print('  ! phrase ignorée :', ph[:60], flush=True); return None
            return {'f': fn, 'gap': 0 if last else int(gap * gf)}
        res = await asyncio.gather(*[one(i, ph) for i, ph in enumerate(ps)])
        segs = [x for x in res if x]
        manifest[key] = segs; done += 1
        print(f"[{done}] {key} {L.get('mood')}: {len(ps)} phrase(s)", flush=True)
        json.dump(manifest, open(mpath, 'w', encoding='utf8'), ensure_ascii=False, indent=0)
    json.dump(manifest, open(mpath, 'w', encoding='utf8'), ensure_ascii=False, indent=0)
    print(f"terminé : {done} réplique(s) générée(s), {len(manifest)} au total, voix {VOICE}")

asyncio.run(main())
