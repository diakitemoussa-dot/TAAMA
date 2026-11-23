/* ==========================================================
   CARTE INTERACTIVE DE L'AFRIQUE DE L'OUEST — écran « Destinations »
   ----------------------------------------------------------
   Vraie carte géographique (Leaflet) :
     • frontières et fleuves réels (Natural Earth), dans le style du jeu ;
     • destinations placées à leurs vraies coordonnées ;
     • zoom fluide à la molette, au pincement et aux boutons, déplacement
       avec inertie, double-clic pour zoomer ;
     • vue « Satellite » (Esri World Imagery) pour zoomer jusqu'à la vraie
       Grande Mosquée de Djenné.

   Leaflet et les données sont des copies locales (assets/vendor, assets/data) :
   la carte de jeu fonctionne sans service externe ; seule la vue satellite
   charge des images depuis Internet.

   Les fonctions pures (coordonnées, courbes, point dans un pays) sont
   testées sous Node ; createDestinationsMap() ne s'exécute que dans le navigateur.
   ========================================================== */

export const GEO = {
  djenne:     { lat: 13.9056, lng: -4.5553 },
  bandiagara: { lat: 14.3500, lng: -3.6100 },
  segou:      { lat: 13.4317, lng: -6.2157 },
  bamako:     { lat: 12.6392, lng: -8.0029 },
  lome:       { lat: 6.1375,  lng: 1.2123 },
};

/** Pistes « à découvrir » (marqueurs « ? ») : emplacements fictifs, non localisés dans le scénario. */
export const UNKNOWN_SPOTS = [
  { id: 'inconnu-nord', lat: 16.2, lng: -2.6, side: 'r' },
  { id: 'inconnu-sud', lat: 7.4, lng: -1.2, side: 'l' },
];

/** Zone affichée au départ et limites de déplacement. */
export const REGION_BOUNDS = [[4.6, -13.8], [19.4, 6.6]];      // le Mali et ses voisins, de Lomé au nord du Mali : la carte est grande à l'écran
export const PAN_LIMITS = [[-4, -32], [38, 34]];

/** Côté d'affichage du nom autour de chaque marqueur. */
export const LABEL_SIDE = { djenne: 'b', bandiagara: 'r', segou: 'l', bamako: 'l', lome: 'r' };

/** Libellés de pays (texte français = clé de traduction), à leur emplacement. */
export const COUNTRY_LABELS = [
  { text: 'MALI', lat: 17.4, lng: -3.2, cls: 'gm-mali' },
  { text: 'MAURITANIE', lat: 20.6, lng: -10.8 },
  { text: 'SÉNÉGAL', lat: 14.6, lng: -14.6 },
  { text: 'GUINÉE', lat: 10.6, lng: -11.6 },
  { text: 'CÔTE D’IVOIRE', lat: 7.6, lng: -5.6 },
  { text: 'BURKINA FASO', lat: 12.2, lng: -1.7 },
  { text: 'GHANA', lat: 9.3, lng: -1.3 },
  { text: 'BÉNIN', lat: 9.5, lng: 2.3 },
  { text: 'NIGER', lat: 17.2, lng: 7.6 },
  { text: 'NIGÉRIA', lat: 9.4, lng: 8.0 },
  { text: 'ALGÉRIE', lat: 25.5, lng: 2.5 },
  { text: 'Océan Atlantique', lat: 8.6, lng: -15.9, cls: 'gm-sea' },
  { text: 'Golfe de Guinée', lat: 3.9, lng: -0.5, cls: 'gm-sea' },
];

/* ---------------- fonctions pures ---------------- */

/** Courbe de Bézier quadratique entre deux points (lat/lng) : `bend` = écart relatif perpendiculaire. */
export function curvePoints(a, b, bend = 0.1, steps = 24) {
  const mid = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
  const dx = b.lng - a.lng, dy = b.lat - a.lat;
  const c = { lat: mid.lat + dx * bend, lng: mid.lng - dy * bend };
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    pts.push([u * u * a.lat + 2 * u * t * c.lat + t * t * b.lat, u * u * a.lng + 2 * u * t * c.lng + t * t * b.lng]);
  }
  return pts;
}

function inRing(lat, lng, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Le point (lat, lng) est-il dans ce pays (feature GeoJSON Polygon / MultiPolygon) ? */
export function countryContains(feature, lat, lng) {
  const g = feature.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  return polys.some((poly) => inRing(lat, lng, poly[0]) && !poly.slice(1).some((hole) => inRing(lat, lng, hole)));
}

/** Nom du pays contenant le point, ou null. */
export function countryAt(countries, lat, lng) {
  const f = countries.features.find((x) => countryContains(x, lat, lng));
  return f ? f.properties.name : null;
}

/* ---------------- styles de la carte ---------------- */

const STYLE_CSS = `
.leaflet-container{background:#3f3147;font-family:'Open Sans',system-ui,sans-serif;outline:none}
.leaflet-container .leaflet-control-scale-line{background:rgba(85,65,93,.85);color:#F8F3EA;border:1px solid rgba(248,243,234,.5);border-top:0;font-size:11px;font-weight:700;padding:1px 8px}
.gm-pin{position:relative;width:0;height:0;color:#F8F3EA;cursor:pointer}
.gm-hit{position:absolute;left:-26px;top:-26px;width:52px;height:52px;border-radius:50%}
.gm-dot{position:absolute;box-sizing:border-box;border-radius:50%}
.gm-locked .gm-dot{left:calc(-12px * var(--gm-s,1));top:calc(-12px * var(--gm-s,1));width:calc(24px * var(--gm-s,1));height:calc(24px * var(--gm-s,1));background:#55415D;border:2px solid #F8F3EA;display:flex;align-items:center;justify-content:center}
.gm-locked .gm-dot svg{width:calc(10px * var(--gm-s,1));height:calc(12px * var(--gm-s,1))}
.gm-open .gm-dot{left:calc(-13px * var(--gm-s,1));top:calc(-13px * var(--gm-s,1));width:calc(26px * var(--gm-s,1));height:calc(26px * var(--gm-s,1));background:#F9D58B;border:3px solid #F8F3EA;box-shadow:0 0 0 calc(8px * var(--gm-s,1)) rgba(249,213,139,.28),0 0 26px rgba(249,213,139,.75)}
.gm-unknown .gm-dot{left:calc(-12px * var(--gm-s,1));top:calc(-12px * var(--gm-s,1));width:calc(24px * var(--gm-s,1));height:calc(24px * var(--gm-s,1));background:#55415D;border:2px dashed rgba(248,243,234,.85);font:700 calc(14px * var(--gm-s,1))/calc(20px * var(--gm-s,1)) 'Open Sans',sans-serif;text-align:center}
.gm-label{position:absolute;white-space:nowrap;line-height:1.15;text-shadow:0 1px 6px rgba(40,26,46,.95),0 0 3px rgba(40,26,46,.9)}
.gm-r .gm-label{left:calc(19px * var(--gm-s,1));top:calc(-19px * var(--gm-s,1))}
.gm-l .gm-label{right:calc(19px * var(--gm-s,1));top:calc(-19px * var(--gm-s,1));text-align:right}
.gm-b .gm-label{left:-90px;width:180px;top:calc(22px * var(--gm-s,1));text-align:center}
.gm-name{display:block;font-weight:700;font-size:calc(15px * var(--ts,1) * var(--gm-s,1))}
.gm-open .gm-name{font-family:'Rubik',sans-serif;font-weight:800;font-size:calc(24px * var(--ts,1) * var(--gm-s,1))}
.gm-sub{display:block;font-weight:600;font-size:calc(12px * var(--ts,1) * var(--gm-s,1));opacity:.9}
.gm-open .gm-sub{color:#F9D58B;letter-spacing:.12em;font-weight:700}
.gm-ring{width:calc(68px * var(--gm-s,1));height:calc(68px * var(--gm-s,1));margin:calc(-34px * var(--gm-s,1)) 0 0 calc(-34px * var(--gm-s,1));border:3px dashed #F8F3EA;border-radius:50%;box-sizing:border-box;animation:gm-spin 14s linear infinite;pointer-events:none}
.gm-ring.gm-ring-open{border-color:#F9D58B}
@keyframes gm-spin{to{transform:rotate(360deg)}}
.gm-country{position:relative;width:0;height:0;pointer-events:none}
.gm-country span{position:absolute;transform:translate(-50%,-50%);white-space:nowrap;font:700 calc(12px * var(--ts,1) * var(--gm-s,1)) 'Open Sans',sans-serif;letter-spacing:.24em;color:rgba(248,243,234,.6)}
.gm-country.gm-mali span{font:800 calc(44px * var(--ts,1) * var(--gm-s,1)) 'Rubik',sans-serif;letter-spacing:.3em;color:rgba(249,213,139,.5)}
.gm-country.gm-sea span{font-style:italic;font-weight:600;letter-spacing:0;font-size:calc(13px * var(--ts,1) * var(--gm-s,1));color:rgba(248,243,234,.75)}
.gm-hide-labels .gm-country{display:none}
.gu-focus{outline:3px solid #F8F3EA!important;outline-offset:4px!important;border-radius:50%}
.gm-credit{position:absolute;right:10px;bottom:8px;z-index:900;padding:3px 10px;border-radius:8px;background:rgba(85,65,93,.85);color:#F8F3EA;font-size:11px;font-weight:600;pointer-events:none;display:none}
.gm-sat .gm-credit{display:block}
`;

const LOCK_SVG = '<svg width="10" height="12" viewBox="0 0 14 16" fill="none" stroke="#F8F3EA" stroke-width="2" aria-hidden="true"><rect x="2" y="7" width="10" height="8" rx="3" fill="#F8F3EA"/><path d="M4 7V5a3 3 0 0 1 6 0v2"/></svg>';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const SATELLITE_CREDIT = '© Esri, Maxar, Earthstar Geographics';

/**
 * @param {HTMLElement} container  cadre de la carte (dans le Shadow DOM de l'écran)
 * @param {{ destinations: Array<{id:string,name:string,sub:string,open:boolean}>, t:(s:string)=>string,
 *           insets?:()=>{left:number,top:number,right:number,bottom:number} (px réservés à l'interface par-dessus la carte),
 *           leafletUrl?:string, cssUrl?:string, dataUrl?:string }} opts
 */
export async function createDestinationsMap(container, opts) {
  const { destinations, t = (s) => s, insets = () => ({ left: 8, top: 8, right: 8, bottom: 8 }) } = opts;
  const pad = () => { const i = insets(); return { paddingTopLeft: [i.left, i.top], paddingBottomRight: [i.right, i.bottom] }; };
  const leafletUrl = opts.leafletUrl || new URL('../assets/vendor/leaflet/leaflet.esm.js', import.meta.url).href;
  const cssUrl = opts.cssUrl || new URL('../assets/vendor/leaflet/leaflet.css', import.meta.url).href;
  const dataUrl = opts.dataUrl || new URL('../assets/data/afrique-ouest.json', import.meta.url).href;

  const [L, css, data] = await Promise.all([
    import(leafletUrl),
    fetch(cssUrl).then((r) => r.text()),
    fetch(dataUrl).then((r) => r.json()),
  ]);

  // Leaflet vit dans le Shadow DOM de l'écran : ses styles y sont injectés
  const root = container.getRootNode();
  if (!root.__gmStyles) {
    const st = document.createElement('style');
    st.textContent = css + STYLE_CSS;
    (root.host ? root : document.head).appendChild(st);
    root.__gmStyles = true;
  }

  const map = L.map(container, {
    zoomControl: false, attributionControl: false, keyboard: false,
    zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 100, inertia: true,
    minZoom: 3, maxZoom: 8, maxBounds: PAN_LIMITS, maxBoundsViscosity: 0.9,
  });
  map.fitBounds(REGION_BOUNDS, { animate: false, ...pad() });
  const homeZoom = map.getZoom();
  map.setMinZoom(homeZoom - 0.75);

  /* ----- fond : pays et fleuves ----- */
  const countryStyle = (f, sat) => (f.properties.name === 'Mali'
    ? { color: '#F9D58B', weight: 2.4, fillColor: '#F9D58B', fillOpacity: sat ? 0.04 : 0.27 }
    : { color: '#F8F3EA', weight: 1.1, opacity: sat ? 0.45 : 0.55, fillColor: '#8a6f93', fillOpacity: sat ? 0 : 0.5 });
  let satellite = false;
  const countries = L.geoJSON(data.countries, { interactive: false, style: (f) => countryStyle(f, false) }).addTo(map);
  const rivers = L.geoJSON(data.rivers, {
    interactive: false,
    style: (f) => ({ color: '#C3A5C7', weight: f.properties.name === 'Niger' ? 3 : 1.6, opacity: f.properties.name === 'Niger' ? 0.9 : 0.6, lineCap: 'round' }),
  }).addTo(map);

  /* ----- pistes en pointillés dorés depuis Djenné ----- */
  const routes = [['bandiagara', 0], ['segou', 0.06], ['lome', 0.14]].map(([id, bend]) => (
    L.polyline(curvePoints(GEO.djenne, GEO[id], bend), { color: '#F9D58B', weight: 2.5, dashArray: '2 9', lineCap: 'round', interactive: false, opacity: 0.95 }).addTo(map)
  ));

  /* ----- noms de pays et de mers ----- */
  const labels = COUNTRY_LABELS.map((c) => L.marker([c.lat, c.lng], {
    interactive: false, keyboard: false,
    icon: L.divIcon({ className: '', iconSize: [0, 0], html: `<div class="gm-country ${c.cls || ''}"><span>${esc(t(c.text))}</span></div>` }),
  }).addTo(map));

  /* ----- destinations ----- */
  const markers = {};
  const pin = (kind, side, name, sub, extra = '') => L.divIcon({
    className: '', iconSize: [0, 0],
    html: `<div class="gm-pin gm-${kind} gm-${side}"${extra}><span class="gm-hit"></span><span class="gm-dot">${kind === 'locked' ? LOCK_SVG : (kind === 'unknown' ? '?' : '')}</span><span class="gm-label"><span class="gm-name">${esc(name)}</span><span class="gm-sub">${esc(sub)}</span></span></div>`,
  });
  destinations.forEach((d) => {
    const m = L.marker([GEO[d.id].lat, GEO[d.id].lng], {
      icon: pin(d.open ? 'open' : 'locked', LABEL_SIDE[d.id] || 'r', t(d.name), d.sub),
      keyboard: false, riseOnHover: true, zIndexOffset: d.open ? 800 : 400,
    }).addTo(map);
    markers[d.id] = m;
    const el = m.getElement();
    if (el) {
      el.dataset.dest = d.id;
      el.tabIndex = 0;
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', `${t(d.name)} : ${t(d.open ? 'Disponible' : 'Verrouillée').toLowerCase()}`);
      el.style.outline = 'none';
    }
  });
  UNKNOWN_SPOTS.forEach((u) => L.marker([u.lat, u.lng], {
    icon: pin('unknown', u.side, t('À découvrir'), ''), keyboard: false, interactive: false, zIndexOffset: 100,
  }).addTo(map));

  const ring = L.marker([GEO.djenne.lat, GEO.djenne.lng], {
    icon: L.divIcon({ className: '', iconSize: [0, 0], html: '<div class="gm-ring gm-ring-open"></div>' }),
    interactive: false, keyboard: false, zIndexOffset: 900,
  }).addTo(map);

  L.control.scale({ imperial: false, position: 'bottomleft', maxWidth: 110 }).addTo(map);
  const credit = document.createElement('div');
  credit.className = 'gm-credit';
  credit.textContent = SATELLITE_CREDIT;
  container.appendChild(credit);

  /* ----- vue satellite ----- */
  const tiles = L.tileLayer(ESRI, { maxZoom: 18, maxNativeZoom: 17, attribution: SATELLITE_CREDIT });
  function setSatellite(on) {
    satellite = !!on;
    container.classList.toggle('gm-sat', satellite);
    if (satellite) { tiles.addTo(map); tiles.bringToBack(); map.setMaxZoom(18); rivers.remove(); }
    else { tiles.remove(); rivers.addTo(map); if (map.getZoom() > 8) map.setZoom(8); map.setMaxZoom(8); }
    countries.setStyle((f) => countryStyle(f, satellite));
    updateLabels();
  }
  function updateLabels() {
    container.classList.toggle('gm-hide-labels', satellite || map.getZoom() > 7.25);
    const showBorders = !satellite || map.getZoom() <= 9;
    if (showBorders && !map.hasLayer(countries)) countries.addTo(map);
    else if (!showBorders && map.hasLayer(countries)) countries.remove();
  }
  map.on('zoomend', updateLabels);
  updateLabels();

  /* ----- sélection ----- */
  let selected = 'djenne';
  /** Centre de carte qui place `ll` au milieu de la zone libre (interface retirée). */
  function offsetCenter(ll, zoom) {
    const i = insets();
    const p = map.project(ll, zoom).add([(i.right - i.left) / 2, (i.bottom - i.top) / 2]);
    return map.unproject(p, zoom);
  }
  function select(id, { fly = false } = {}) {
    if (!GEO[id]) return;
    selected = id;
    const d = destinations.find((x) => x.id === id);
    const ll = [GEO[id].lat, GEO[id].lng];
    ring.setLatLng(ll);
    const rEl = ring.getElement();
    if (rEl && rEl.firstElementChild) rEl.firstElementChild.classList.toggle('gm-ring-open', !!(d && d.open));
    if (fly) {
      const z = Math.max(map.getZoom(), 5.5);
      map.flyTo(offsetCenter(ll, z), z, { duration: 0.9 });
    } else {
      const p = map.latLngToContainerPoint(ll), sz = map.getSize(), i = insets();
      const hidden = p.x < i.left || p.x > sz.x - i.right || p.y < i.top || p.y > sz.y - i.bottom;
      if (hidden) map.panTo(offsetCenter(ll, map.getZoom()), { duration: 0.6 });
    }
  }
  select('djenne');

  let gone = false;
  const fitTimer = setTimeout(() => { if (gone) return; try { map.invalidateSize(); map.fitBounds(REGION_BOUNDS, { animate: false, ...pad() }); } catch (_) { /* carte déjà retirée */ } }, 350);          // l'écran apparaît en fondu : on recale la taille

  return {
    map,
    select,
    selected: () => selected,
    zoomIn: () => map.zoomIn(1),
    zoomOut: () => map.zoomOut(1),
    reset: () => { map.flyToBounds(REGION_BOUNDS, { ...pad(), duration: 0.8 }); },
    pointOf: (id) => { const p = map.latLngToContainerPoint([GEO[id].lat, GEO[id].lng]); return { x: p.x, y: p.y }; },
    homeZoom: () => homeZoom,
    setSatellite,
    toggleSatellite() { setSatellite(!satellite); return satellite; },
    isSatellite: () => satellite,
    info: () => ({ zoom: map.getZoom(), satellite, center: map.getCenter(), size: map.getSize(), maxZoom: map.getMaxZoom() }),
    markerElement: (id) => (markers[id] ? markers[id].getElement() : null),
    destroy() { gone = true; clearTimeout(fitTimer); try { map.stop(); map.remove(); } catch (_) { /* écran déjà retiré */ } },
  };
}
