(() => {
  const $ = (id) => document.getElementById(id);

  const launchBtn  = $('launchBtn');
  const liftoff    = $('liftoff');
  const overlay    = $('videoOverlay');
  const video      = $('introVideo');
  const skipBtn    = $('skipBtn');
  const droneMode  = $('droneMode');
  const vMeta      = $('vMeta');
  const tablet     = $('tablet');
  const boot       = $('boot');
  const introStage = $('introStage');
  const introSkip  = $('introSkip');
  const consoleEl  = $('consoleLines');
  const soundBtn   = $('soundToggle');
  const soundLbl   = $('soundLabel');

  const MOBILE = 768;
  const VIDEO_PC       = 'assets/videos/intro-drone format pc.mp4';
  const VIDEO_PORTABLE = 'assets/videos/intro-drone format portable.mp4';

  /* ==========================================================
     AUDIO — synthèse Web Audio (aucun fichier requis)
     ========================================================== */
  let ac = null, hum = null, soundOn = true;

  let modelSound = null;
  const loadModelSound = () => {
    if (modelSound) return;
    modelSound = new Audio('assets/audio/model-sound.mp3');
    modelSound.preload = 'auto';
  };
  loadModelSound();
  const playModelSound = () => {
    if (!soundOn) return;
    modelSound._cut = false;
    modelSound.currentTime = 0;
    modelSound.volume = 0.9;
    modelSound.play().catch(() => {});
  };
  window.playModelSound = playModelSound;
  modelSound.loop = true;

  const initAudio = () => {
    if (ac) return;
    ac = new (window.AudioContext || window.webkitAudioContext)();
  };

  /* Active l'audio dès le premier geste utilisateur.
     iOS Safari bloque les <audio> créés au chargement : il faut les play()+pause()
     synchroniquement dans le handler pour les déverrouiller. */
  const _onFirstGesture = () => {
    initAudio();
    if (ac?.state === 'suspended') ac.resume();

    // Déverrouillage iOS : play+pause sur chaque élément audio de ce module
    [_countdownSound, _transitionSound, _textSound, modelWind, modelSound].forEach(a => {
      if (!a) return;
      a.play().catch(() => {});
      a.pause();
      a.currentTime = 0;
    });

    // Signal aux autres modules (drone-game, sanctuary) pour qu'ils déverrouillent les leurs
    document.dispatchEvent(new Event('audioUnlock'));

    document.removeEventListener('click',      _onFirstGesture);
    document.removeEventListener('touchstart', _onFirstGesture);
    document.removeEventListener('keydown',    _onFirstGesture);
  };
  document.addEventListener('click',      _onFirstGesture);
  document.addEventListener('touchstart', _onFirstGesture);
  document.addEventListener('keydown',    _onFirstGesture);

  const startHum = () => {
    if (!ac || hum) return;
    const o = ac.createOscillator(); o.type='sawtooth'; o.frequency.value=55;
    const o2 = ac.createOscillator(); o2.type='sine'; o2.frequency.value=110;
    const g = ac.createGain(); g.gain.value=0;
    const filter = ac.createBiquadFilter(); filter.type='lowpass'; filter.frequency.value=300;
    o.connect(filter); o2.connect(filter); filter.connect(g); g.connect(ac.destination);
    o.start(); o2.start();
    g.gain.linearRampToValueAtTime(0.04, ac.currentTime + 1.2);
    hum = { o, o2, g };
  };
  const stopHum = () => {
    if (!hum) return;
    hum.g.gain.linearRampToValueAtTime(0, ac.currentTime + 0.3);
    setTimeout(() => { try { hum.o.stop(); hum.o2.stop(); } catch(e){} hum = null; }, 400);
  };

  /* Son holographique : bruit filtré + sweep fréquence — effet "écran qui bugue" */
  const crackle = (vol=0.18, dur=0.28) => {
    if (!ac || !soundOn) return;
    const frames = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, frames, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1);
    const src = ac.createBufferSource(); src.buffer = buf;
    const filt = ac.createBiquadFilter(); filt.type = 'bandpass';
    filt.frequency.setValueAtTime(800, ac.currentTime);
    filt.frequency.linearRampToValueAtTime(3200, ac.currentTime + dur * 0.4);
    filt.frequency.linearRampToValueAtTime(600, ac.currentTime + dur);
    filt.Q.value = 1.8;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    src.connect(filt); filt.connect(g); g.connect(ac.destination);
    src.start(); src.stop(ac.currentTime + dur);
    /* sweep court oscillateur par-dessus */
    const o = ac.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(220, ac.currentTime);
    o.frequency.exponentialRampToValueAtTime(1800, ac.currentTime + dur * 0.3);
    o.frequency.exponentialRampToValueAtTime(110, ac.currentTime + dur);
    const og = ac.createGain();
    og.gain.setValueAtTime(vol * 0.4, ac.currentTime);
    og.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    o.connect(og); og.connect(ac.destination);
    o.start(); o.stop(ac.currentTime + dur);
  };

  /* Clic UI propre : tick court et net */
  const uiClick = () => {
    if (!ac || !soundOn) return;
    const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = 1100;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.12, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.06);
    o.connect(g); g.connect(ac.destination);
    o.start(); o.stop(ac.currentTime + 0.06);
  };

  const beep = (freq=880, dur=.08, type='square', vol=.08) => {
    if (!ac || !soundOn) return;
    const o = ac.createOscillator(); o.type=type; o.frequency.value=freq;
    const g = ac.createGain(); g.gain.value=0;
    o.connect(g); g.connect(ac.destination);
    const t = ac.currentTime;
    g.gain.linearRampToValueAtTime(vol, t+.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
    o.start(t); o.stop(t+dur+.02);
  };

  const futuristicBoot   = () => {};
  window.playDroneReveal = () => {};

  /* Son countdown (compte à rebours) */
  const _countdownSound = new Audio('assets/audio/countdown.mp3');
  _countdownSound.preload = 'auto';
  _countdownSound.volume  = 0.85;

  /* Son transition intro → drone */
  const _transitionSound = new Audio('assets/audio/transition_sound.mp3');
  _transitionSound.preload = 'auto';
  _transitionSound.volume  = 0.9;

  /* Son texte intro */
  const _textSound = new Audio('assets/audio/text_sound.mp3');
  _textSound.preload = 'auto';
  _textSound.volume  = 0.7;
  const _playTextSound = () => {
    if (!soundOn) return;
    _textSound.currentTime = 0;
    _textSound.play().catch(() => {});
  };

  /* Son ambiant — vent sur la maquette */
  const modelWind = new Audio('assets/audio/model_wind.mp3');
  modelWind.preload = 'auto';
  modelWind.loop    = false;
  modelWind.volume  = 0.3;
  modelWind.addEventListener('timeupdate', () => {
    if (modelWind.currentTime >= 30) {
      modelWind.currentTime = 0;
      modelWind.play().catch(() => {});
    }
  });
  const playModelWind = () => { if (soundOn) modelWind.play().catch(() => {}); };
  const stopModelWind = () => { modelWind.pause(); modelWind.currentTime = 0; };
  window.playModelWind = playModelWind;
  window.stopModelWind = stopModelWind;

  const whoosh = () => {
    if (!ac || !soundOn) return;
    const o = ac.createOscillator(); o.type='sawtooth';
    const g = ac.createGain(); g.gain.value=0;
    const f = ac.createBiquadFilter(); f.type='lowpass'; f.frequency.value=2000;
    o.connect(f); f.connect(g); g.connect(ac.destination);
    const t = ac.currentTime;
    o.frequency.setValueAtTime(80, t);
    o.frequency.exponentialRampToValueAtTime(600, t+1.4);
    f.frequency.exponentialRampToValueAtTime(200, t+1.4);
    g.gain.linearRampToValueAtTime(.18, t+.1);
    g.gain.linearRampToValueAtTime(0, t+1.6);
    o.start(t); o.stop(t+1.7);
  };

  /* Bouton affiché ON dès le départ */
  soundBtn.classList.add('on');
  soundLbl.textContent = 'SON ON';

  soundBtn.addEventListener('click', () => {
    initAudio();
    if (ac?.state === 'suspended') ac.resume();
    soundOn = !soundOn;
    soundBtn.classList.toggle('on', soundOn);
    soundLbl.textContent = soundOn ? 'SON ON' : 'SON OFF';
    if (soundOn) { startHum(); beep(660,.1); } else stopHum();
  });

  /* ==========================================================
     INTRO — animation de texte d'entrée (révélation séquentielle)
     ========================================================== */
  const introLines = [
    'Patrimoine mondial UNESCO',
    'Située au Mali',
    'Fondée au XIIIe siècle',
    'Bâtie en banco',
    'Kabakoo Academies',
  ];

  let introTimers = [];
  let introDone   = false;

  const finishIntro = () => {
    if (introDone) return;
    introDone = true;
    introTimers.forEach(clearTimeout);
    introTimers = [];
    boot.classList.add('done');
    document.body.classList.add('intro-done');   // rejoue l'entrée du tableau de bord (transition)
    pushConsole('Système opérationnel · attente commande');
    if (soundOn) { _transitionSound.currentTime = 0; _transitionSound.play().catch(() => {}); playModelSound(); }
    const _glitch = document.getElementById('glitchOverlay');
    if (_glitch) {
      _glitch.classList.remove('active');
      void _glitch.offsetWidth;
      _glitch.classList.add('active');
      setTimeout(() => _glitch.classList.remove('active'), 950);
    }
    if (soundOn) { initAudio(); if (ac?.state === 'suspended') ac.resume(); startHum(); }
  };

  const runIntro = () => {
    if (!introStage) { finishIntro(); return; }


    const HOLD = 1900;        // temps d'affichage de chaque ligne (lecture confortable)
    const OUT  = 450;         // durée de la sortie
    const GAP  = 300;         // temps mort entre deux étapes (transition nette)
    let t = 300;              // léger délai avant la 1re ligne
    introLines.forEach((txt, i) => {
      const last = i === introLines.length - 1;
      // apparition de la ligne (zoom focus ; filet réservé à la signature)
      introTimers.push(setTimeout(() => {
        const line = document.createElement('div');
        line.className = 'intro-line' + (last ? ' signature' : '');
        line.innerHTML =
          `<span class="intro-text">${txt}</span>` +
          (last ? '<i class="intro-rule"></i>' : '');
        _playTextSound();
        introStage.replaceChildren(line);
      }, t));
      if (!last) {
        // sortie de la ligne, puis temps mort avant la suivante (transition étape -> étape)
        introTimers.push(setTimeout(() => {
          const line = introStage.firstElementChild;
          if (line) line.classList.add('leaving');
        }, t + HOLD));
        t += HOLD + OUT + GAP;
      } else {
        // la signature reste un peu plus longtemps, puis fondu général
        introTimers.push(setTimeout(finishIntro, t + HOLD + 900));
      }
    });
  };

  if (introSkip) {
    const skip = () => finishIntro();
    introSkip.addEventListener('click', skip);
    introSkip.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); skip(); }
    });
  }

  /* ==========================================================
     CONSOLE DÉFILANTE
     ========================================================== */
  const msgPool = [
    'IMU stable · drift 0.02°/s',
    'GPS · 12 satellites verrouillés',
    'Vent latéral détecté · NE 04 m/s',
    'Altitude cible : 80 m',
    'Trajectoire calculée vers Djenné',
    'Caméra · exposition auto',
    'Batterie · cellules équilibrées',
    'Liaison vidéo · 4K @ 60 fps',
    'Distance cible · 142 m',
    'Magnétomètre · CAL nominal',
    'Maghrib · lumière dorée optimale',
    'Téléchargement plan de vol · OK',
    'Détection obstacles · CLEAR',
    'Compass heading · 045°',
  ];
  const pushConsole = (txt) => {
    consoleEl.innerHTML = `<span>${txt}</span>`;
  };
  let msgIdx = 0;
  setInterval(() => {
    if (boot && !boot.classList.contains('done')) return;
    pushConsole(msgPool[msgIdx % msgPool.length]);
    msgIdx++;
  }, 2200);

  /* ==========================================================
     TÉLÉMÉTRIE TEMPS RÉEL
     ========================================================== */
  const stateNodes = {
    signal:  document.querySelector('.bar-row:nth-child(1) .track span'),
    battery: document.querySelector('.bar-row:nth-child(2) .track span'),
    gps:     document.querySelector('.bar-row:nth-child(3) .track span'),
    signalV: document.querySelector('.bar-row:nth-child(1) b'),
    batteryV:document.querySelector('.bar-row:nth-child(2) b'),
    gpsV:    document.querySelector('.bar-row:nth-child(3) b'),
    readyPct:$('readyPct'),
  };
  const miniStats = document.querySelectorAll('.t-mini b');

  const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
  const state = { signal:98, battery:100, gps:92, alt:0, ready:98 };

  const tickTelemetry = () => {
    state.signal  = clamp(state.signal  + (Math.random()-.5)*2, 86, 100);
    state.battery = clamp(state.battery - 0.04, 0, 100);
    state.gps     = clamp(state.gps     + (Math.random()-.5)*1.2, 85, 99);
    state.ready   = Math.round((state.signal + state.gps) / 2);

    const set = (s, v) => { s.style.setProperty('--w', v+'%'); };
    set(stateNodes.signal,  state.signal);
    set(stateNodes.battery, state.battery);
    set(stateNodes.gps,     state.gps);
    stateNodes.signalV.textContent  = Math.round(state.signal)  + '%';
    stateNodes.batteryV.textContent = Math.round(state.battery) + '%';
    stateNodes.gpsV.textContent     = Math.round(state.gps)     + '%';
    stateNodes.readyPct.textContent = state.ready;

    if (miniStats[0]) miniStats[0].textContent = state.alt.toFixed(0).padStart(2,'0') + 'm';
    if (miniStats[1]) miniStats[1].textContent = Math.round(state.signal) + '%';
    if (miniStats[2]) miniStats[2].textContent = Math.round(state.battery) + '%';
  };
  setInterval(tickTelemetry, 600);

  /* ==========================================================
     HORLOGE + MAGHRIB
     ========================================================== */
  const heureRow = document.querySelectorAll('.t-content em')[3];
  const tickClock = () => {
    if (!heureRow) return;
    const d = new Date();
    const hh = String(d.getHours()).padStart(2,'0');
    const mm = String(d.getMinutes()).padStart(2,'0');
    const ss = String(d.getSeconds()).padStart(2,'0');
    heureRow.textContent = `${hh}:${mm}:${ss} · MAGHRIB`;
  };
  setInterval(tickClock, 1000);
  tickClock();

  /* ==========================================================
     PARALLAXE SOURIS
     ========================================================== */
  document.addEventListener('mousemove', (e) => {
    if (!tablet || window.innerWidth < 1024) return;
    const x = (e.clientX / window.innerWidth  - 0.5) * 8;
    const y = (e.clientY / window.innerHeight - 0.5) * 6;
    tablet.style.transform = `perspective(1400px) rotateX(${4 - y}deg) rotateY(${-3 + x}deg)`;
  });

  /* ==========================================================
     GLITCH ALÉATOIRE
     ========================================================== */
  let mouseOverTablet = false;
  if (tablet) {
    tablet.addEventListener('mouseenter', () => { mouseOverTablet = true; });
    tablet.addEventListener('mouseleave', () => { mouseOverTablet = false; });
  }

  const scheduleGlitch = () => {
    const delay = 6000 + Math.random()*8000;
    setTimeout(() => {
      tablet.classList.add('glitch');
      if (mouseOverTablet) crackle(0.15, 0.3);
      setTimeout(() => tablet.classList.remove('glitch'), 300);
      scheduleGlitch();
    }, delay);
  };
  scheduleGlitch();

  /* ==========================================================
     SONS UI
     ========================================================== */

  /* ==========================================================
     MODE DRONE (PC / PORTABLE)
     ========================================================== */
  const pickVideo = () => {
    const isMobile = window.innerWidth < MOBILE;
    return {
      src: isMobile ? VIDEO_PORTABLE : VIDEO_PC,
      mode: isMobile ? 'FORMAT PORTABLE' : 'FORMAT PC'
    };
  };
  const updateMode = () => { droneMode.textContent = pickVideo().mode; };
  updateMode();

  // Préchargement de la vidéo d'intro dès l'accueil : elle bufferise pendant que
  // l'utilisateur lit le texte d'intro -> lecture instantanée au décollage.
  const absUrl = (s) => new URL(s, location.href).href;
  const preloadVideo = () => {
    const { src } = pickVideo();
    if (video.currentSrc !== absUrl(src) && video.getAttribute('src') !== src) {
      video.src = src;
      video.load();
    }
  };
  preloadVideo();
  window.addEventListener('resize', () => { updateMode(); preloadVideo(); });

  /* ==========================================================
     SÉQUENCE DE DÉCOLLAGE + VIDÉO
     ========================================================== */
  const fmt = (s) => {
    s = Math.max(0, Math.floor(s));
    return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  };

  // ===== Compte à rebours de lancement =====
  const loShake  = document.querySelector('.lo-shake');
  const loDigit  = document.getElementById('liftoffDigit');
  const loTminus = document.getElementById('liftoffTminus');
  const loLabel  = document.getElementById('liftoffLabel');
  const loCharge = document.getElementById('liftoffCharge');
  const loFlash  = document.getElementById('liftoffFlash');

  const setDigit = (txt, cls='tick') => {
    if (!loDigit) return;
    loDigit.className = 'lo-digit';
    void loDigit.offsetWidth;        // force reflow pour relancer l'animation
    loDigit.textContent = txt;
    loDigit.classList.add(cls);
  };
  const setLabel  = t => { if (loLabel)  loLabel.textContent = t; };
  const setTminus = t => { if (loTminus) loTminus.textContent = t; };

  const showLiftoff = () => new Promise((resolve) => {
    // reset
    if (loShake)  loShake.classList.remove('shaking','go-shake','spool','go');
    if (loCharge) loCharge.style.strokeDashoffset = '578';
    if (loFlash)  loFlash.classList.remove('fire');
    setLabel('PRÉPARATION'); setTminus('T - 0:03');
    if (loDigit) { loDigit.textContent = ''; loDigit.className = 'lo-digit'; }

    liftoff.classList.add('on');

    // altitude simulée
    let alt = 0;
    const riseId = setInterval(() => {
      alt += 6; state.alt = alt;
      if (alt >= 80) clearInterval(riseId);
    }, 70);

    // T-3
    setTimeout(() => {
      setDigit('3'); setLabel('SPOOL-UP MOTEURS'); setTminus('T - 0:03');
      if (loShake)  loShake.classList.add('shaking','spool');
      if (loCharge) loCharge.style.strokeDashoffset = '385';   // ~33%
      if (soundOn) {
        const startAt = 8;
        _countdownSound.currentTime = (_countdownSound.duration > startAt) ? startAt : 0;
        _countdownSound.play().catch(() => {});
      }
    }, 200);

    // T-2
    setTimeout(() => {
      setDigit('2'); setLabel('ANNEAUX EN CHARGE'); setTminus('T - 0:02');
      if (loCharge) loCharge.style.strokeDashoffset = '192';   // ~66%
    }, 1100);

    // T-1
    setTimeout(() => {
      setDigit('1'); setLabel('VERROUILLAGE CIBLE'); setTminus('T - 0:01');
      if (loCharge) loCharge.style.strokeDashoffset = '40';    // ~93%
    }, 2000);

    // GO !
    setTimeout(() => {
      setDigit('GO', 'go'); setLabel('DÉCOLLAGE'); setTminus('T + 0:00');
      if (loShake)  { loShake.classList.remove('spool'); loShake.classList.add('go','go-shake'); }
      if (loCharge) loCharge.style.strokeDashoffset = '0';
      if (loFlash)  loFlash.classList.add('fire');
    }, 2900);

    // fin de séquence
    setTimeout(() => {
      liftoff.classList.remove('on');
      if (loShake) loShake.classList.remove('shaking','go-shake','go');
      _countdownSound.pause();
      _countdownSound.currentTime = 0;
      resolve();
    }, 3700);
  });

  const playVideo = async () => {
    const { src } = pickVideo();
    // Normalement déjà préchargée ; on ne (re)charge que si la source a changé.
    if (video.getAttribute('src') !== src) { video.src = src; video.load(); }
    overlay.classList.add('on');
    overlay.setAttribute('aria-hidden','false');
    try { await video.play(); }
    catch { video.muted = true; try { await video.play(); } catch(_){} }
  };

  const closeVideo = () => {
    video.pause();
    video.muted = false;
    video.volume = 1;
    video.removeAttribute('src');
    video.load();
    overlay.classList.remove('on');
    overlay.setAttribute('aria-hidden','true');
    state.alt = 0;
    playModelWind();
    // Enchaîne sur la maquette 3D de la ville (dôme de ciel + nuages + mosquée)
    if (typeof window.startMosqueScene === 'function') window.startMosqueScene();
  };

  const CUT_AT = 10; // couper la vidéo à 10s → enchaîne sur la vue mosquée
  video.addEventListener('timeupdate', () => {
    vMeta.textContent = `DRONE · ${fmt(video.currentTime)}`;
    if (video.currentTime >= 2) {
      const vol = Math.max(0, 1 - (video.currentTime - 2) / 6);
      video.volume = vol;
    }
    if (video.currentTime >= CUT_AT && !video._cut) {
      video._cut = true;
      video.dispatchEvent(new Event('ended'));
    }
  });
  video.addEventListener('ended', closeVideo);
  skipBtn.addEventListener('click', () => {
    if (video._cut) { closeVideo(); return; }
    video._cut = true;
    video.dispatchEvent(new Event('ended')); // ferme la vidéo (closeVideo)
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('on')) closeVideo();
  });

  document.querySelectorAll('.t-row, .launch, .sound-btn').forEach(el => {
    el.addEventListener('mouseenter', () => beep(1400, .03, 'sine', .04));
  });

  /* Clic sur tous les boutons de l'expérience */
  document.addEventListener('click', (e) => {
    const el = e.target.closest('button, [role="button"], .intro-skip, .skip');
    if (!el) return;
    if (el.matches('[data-action="game"]')) return;
    uiClick();
  });
  launchBtn.addEventListener('click', async () => {
    launchBtn.disabled = true;
    launchBtn.classList.add('firing');
    setTimeout(() => launchBtn.classList.remove('firing'), 600);
    pushConsole('Séquence de décollage engagée');
    stopHum();
    modelSound.pause(); modelSound.currentTime = 0;
    await showLiftoff();
    pushConsole('Drone en vol · cap vers la Grande Mosquée');
    await playVideo();
    launchBtn.disabled = false;
  });

  /* ==========================================================
     LANCEMENT DE L'INTRO
     Sur mobile (touch), on attend le 1er geste avant de lancer
     l'intro — sinon les sons sont bloqués par la politique autoplay.
     Sur desktop, on part immédiatement.
     ========================================================== */
  const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

  if (!isTouchDevice) {
    runIntro();
  } else {
    // Affiche un hint "touchez pour commencer"
    const tapHint = document.createElement('div');
    tapHint.id = 'tapHint';
    tapHint.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:999',
      'display:flex', 'flex-direction:column',
      'align-items:center', 'justify-content:center',
      'gap:16px', 'cursor:pointer',
      'background:transparent',
    ].join(';');
    tapHint.innerHTML = `
      <span style="font-family:'Consolas',monospace;font-size:11px;
        letter-spacing:.35em;color:#f9d58baa;text-transform:uppercase;
        animation:blink 1.4s infinite">TOUCHEZ POUR COMMENCER</span>
      <span style="font-size:28px;animation:blink 1.4s .7s infinite">◈</span>`;
    document.body.appendChild(tapHint);

    const startOnTouch = () => {
      tapHint.remove();
      runIntro();
    };
    tapHint.addEventListener('touchstart', startOnTouch, { once: true });
    tapHint.addEventListener('click',      startOnTouch, { once: true });
  }

})();
