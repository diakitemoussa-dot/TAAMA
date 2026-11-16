/* ==========================================================
   MODE TEST — démarrage (script classique, chargé dans <head>)
   ----------------------------------------------------------
   Doit s'exécuter AVANT tous les autres scripts du jeu : il efface
   la progression, le profil et les réglages enregistrés sur l'appareil
   pour que chaque nouveau joueur découvre le jeu comme la toute
   première fois.

   ?test=1   active le mode test (l'appareil s'en souvient)
   ?test=0   le désactive

   Un rechargement de page pendant la partie d'un joueur ne remet
   rien à zéro : seule « Joueur suivant » (panneau TEST) le fait.
   Logique détaillée : app/playtest-core.js · enregistrement : app/playtest.js
   ========================================================== */
(function () {
  try {
    var ls = window.localStorage, ss = window.sessionStorage;
    var m = /[?&]test=([^&]*)/.exec(location.search);
    var on = m ? (m[1] !== '0' && m[1] !== 'false') : ls.getItem('taamaTest.on') === '1';
    if (m) { if (on) ls.setItem('taamaTest.on', '1'); else ls.removeItem('taamaTest.on'); }
    if (!on) return;
    window.__TAAMA_TEST = true;

    if (ls.getItem('taamaTest.current')) { window.__TAAMA_TEST_RELOAD = true; return; }   // même joueur : la page a seulement été rechargée

    // Nouveau joueur : on efface tout ce que le jeu a gardé sur cet appareil (jamais les données du mode test)
    [ls, ss].forEach(function (st) {
      var keys = [];
      for (var i = 0; i < st.length; i++) keys.push(st.key(i));
      keys.forEach(function (k) {
        if (k && k.indexOf('taamaTest.') !== 0 && (k.indexOf('taama.') === 0 || k.indexOf('djenne.') === 0)) st.removeItem(k);
      });
    });

    var h = function () { return Math.floor(Math.random() * 0x10000).toString(16); };
    var pad = function (s) { return ('0000' + s).slice(-4); };
    var id = pad(h()) + pad(h()) + '-' + pad(h()) + '-' + pad(h());
    ls.setItem('taamaTest.current', JSON.stringify({
      format: 'taama-playtest', v: 1, id: id,
      startedAt: new Date().toISOString(), endedAt: null,
      device: null, player: null, url: location.pathname, events: [], sentAt: null,
    }));
    window.__TAAMA_TEST_NEW = true;
  } catch (e) { /* stockage indisponible : le jeu démarre normalement */ }
})();
