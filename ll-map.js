/* LIFELINK map helper (window.LLMap).
   - Base map: MapTiler "streets" VECTOR style rendered with MapLibre GL inside Leaflet (crisp street names, buildings, landmarks).
     If WebGL or the vector libraries are unavailable it falls back automatically to sharp 512 px @2x MapTiler raster tiles.
   - Landmarks: own colour-coded icons (hotels, food, hospitals, churches/mosques, schools, shops, banks, fuel, transport, landmarks)
     that appear progressively as you zoom in; clearer street, junction and neighbourhood labels; tap a landmark to pick it.
   - Address search (MapTiler Geocoding, Nigeria first) and reverse geocoding (street + area for any point).
   - picker(): Bolt-style "move the map under the pin" location chooser with search and "my location".
   - marker()/moveTo(): clear markers that glide smoothly between live GPS updates.
   - share(): live location sharing for a booking (unchanged contract).
   The MapTiler key is the PUBLIC key from supabase-config.js. Restrict it by allowed origins in the MapTiler dashboard.
   Attribution to MapTiler and OpenStreetMap is required and shown. */
(function () {
  'use strict';
  var BENIN = [6.3350, 5.6037];
  var LEAFLET = '1.9.4', MAPLIBRE = '4.7.1', BRIDGE = ['0.0.22', '0.0.20'];
  var CDN = 'https://cdn.jsdelivr.net/npm/';
  var ATTR = '<a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener">&copy; MapTiler</a> <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">&copy; OpenStreetMap contributors</a>';
  var loading = null, vectorLoading = null;

  function cfgKey() { return ((window.LL_SUPABASE_CONFIG || {}).maptilerKey || '').trim(); }

  function addCss(href) { var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l); }
  function addJs(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script'); s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Could not load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function webgl() {
    try { var c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl'))); } catch (e) { return false; }
  }

  // Leaflet is required. The vector engine is optional (nice to have).
  function load() {
    if (window.L && window.L.map) return Promise.resolve(window.L);
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      addCss(CDN + 'leaflet@' + LEAFLET + '/dist/leaflet.css');
      addJs(CDN + 'leaflet@' + LEAFLET + '/dist/leaflet.js').then(function () {
        window.L ? resolve(window.L) : reject(new Error('The map library did not load.'));
      }, function () { loading = null; reject(new Error('The map library could not be loaded. Check your connection.')); });
    });
    return loading;
  }
  function loadVector() {
    if (!webgl()) return Promise.resolve(false);
    if (window.L && window.L.maplibreGL) return Promise.resolve(true);
    if (vectorLoading) return vectorLoading;
    addCss(CDN + 'maplibre-gl@' + MAPLIBRE + '/dist/maplibre-gl.css');
    vectorLoading = addJs(CDN + 'maplibre-gl@' + MAPLIBRE + '/dist/maplibre-gl.js').then(function () {
      var i = 0;
      function next() {
        return addJs(CDN + '@maplibre/maplibre-gl-leaflet@' + BRIDGE[i] + '/leaflet-maplibre-gl.js').catch(function (e) { if (++i < BRIDGE.length) return next(); throw e; });
      }
      return next();
    }).then(function () { return !!(window.L && window.L.maplibreGL); }, function () { return false; });
    return vectorLoading;
  }

  function rasterLayer(L, key) {
    // Same tiles as the first version (street names baked in), sharper on retina screens via @2x.
    return L.tileLayer('https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}{r}.png?key=' + encodeURIComponent(key), {
      maxZoom: 20, attribution: ATTR, crossOrigin: true, detectRetina: false
    });
  }

  function note(el, text) {
    var n = document.createElement('div');
    n.className = 'absolute left-3 right-3 bottom-8 z-[1000] bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold rounded-xl p-3';
    n.style.zIndex = 1000; n.textContent = text;
    if (!el.style.position) el.style.position = 'relative'; el.appendChild(n);
  }

  var CSS_DONE = false;
  function css() {
    if (CSS_DONE) return; CSS_DONE = true;
    var s = document.createElement('style');
    s.textContent =
      '.llm-pulse{position:relative;width:22px;height:22px}.llm-pulse i{position:absolute;inset:0;border-radius:9999px;background:var(--c);opacity:.35;animation:llmP 1.8s ease-out infinite}' +
      '.llm-pulse b{position:absolute;inset:4px;border-radius:9999px;background:var(--c);border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.4)}' +
      '@keyframes llmP{0%{transform:scale(.6);opacity:.55}100%{transform:scale(2.4);opacity:0}}' +
      '.llm-drop{width:34px;height:42px;filter:drop-shadow(0 4px 5px rgba(0,0,0,.35))}' +
      '.llm-veh{width:38px;height:38px;border-radius:9999px;background:#059669;border:3px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center}' +
      '.llm-lbl{background:#0f172a;color:#fff;font:800 11px/1 "Plus Jakarta Sans",system-ui,sans-serif;padding:5px 8px;border-radius:8px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.3)}' +
      '.llm-me{position:relative;width:24px;height:24px}.llm-me i{position:absolute;inset:0;border-radius:9999px;background:#1a73e8;opacity:.3;animation:llmP 2.2s ease-out infinite}' +
      '.llm-me b{position:absolute;inset:4px;border-radius:9999px;background:#1a73e8;border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.45)}' +
      '.llm-full{position:fixed;inset:0;z-index:99990;background:#e5e7eb;font-family:"Plus Jakarta Sans",system-ui,sans-serif;isolation:isolate;animation:llmFade .22s ease both}' +
      '@keyframes llmFade{from{opacity:0}to{opacity:1}}@keyframes llmUp{from{transform:translateY(40px);opacity:0}to{transform:none;opacity:1}}' +
      '.llm-full .llm-center{position:absolute;left:50%;top:50%;width:42px;height:52px;margin:-52px 0 0 -21px;z-index:900;pointer-events:none;transition:transform .18s ease}' +
      '.llm-full.llm-moving .llm-center{transform:translateY(-12px)}' +
      '.llm-shadow{position:absolute;left:50%;top:50%;width:14px;height:5px;margin:-3px 0 0 -7px;border-radius:50%;background:rgba(0,0,0,.35);z-index:899;pointer-events:none;transition:transform .18s ease,opacity .18s}' +
      '.llm-moving .llm-shadow{transform:scale(1.5);opacity:.5}' +
      '.llm-back{position:absolute;left:14px;top:14px;z-index:1001;width:44px;height:44px;border-radius:9999px;background:#fff;border:0;box-shadow:0 4px 14px rgba(15,23,42,.25);display:flex;align-items:center;justify-content:center;color:#0f172a;cursor:pointer}' +
      '.llm-sheet{position:absolute;z-index:1001;left:0;right:0;bottom:0;background:#fff;border-radius:24px 24px 0 0;box-shadow:0 -8px 30px rgba(15,23,42,.18);padding:8px 18px max(18px,env(safe-area-inset-bottom));animation:llmUp .3s ease both;max-height:78%;overflow:auto}.llm-full .llm-sheet{display:flex;flex-direction:column;gap:10px;max-height:78vh;overflow:visible}.llm-full .llm-sheet .llm-results{overflow:auto}' +
      '.llm-grab{width:40px;height:4px;border-radius:9px;background:#d1d5db;margin:0 auto 2px}' +
      '.llm-title{font:800 18px "Plus Jakarta Sans",system-ui,sans-serif;color:#0f172a;margin:0}' +
      '.llm-sbox{position:relative}.llm-sbox svg{position:absolute;left:14px;top:50%;margin-top:-9px;width:18px;height:18px;color:#0f172a}' +
      '.llm-sbox input{width:100%;background:#f1f2f4;border:2px solid transparent;border-radius:14px;padding:14px 14px 14px 42px;font:700 15px "Plus Jakarta Sans",system-ui,sans-serif;color:#0f172a;outline:none}' +
      '.llm-sbox input:focus{background:#fff;border-color:#0f172a}' +
      '.llm-results{overflow:auto;max-height:40vh;margin:0 -6px}.llm-results[hidden]{display:none}' +
      '.llm-results button{display:block;width:100%;text-align:left;padding:11px 8px;border:0;background:none;border-bottom:1px solid #f1f5f9;cursor:pointer;font-family:inherit;border-radius:10px}' +
      '.llm-results button:hover,.llm-results button.on{background:#f1f5f9}.llm-results b{display:block;font-size:14px;color:#0f172a}.llm-results span{display:block;font-size:12px;font-weight:600;color:#6b7280;margin-top:2px}' +
      '.llm-none{padding:12px 8px;font:700 13px sans-serif;color:#6b7280}' +
      '.llm-addr{display:flex;gap:12px;align-items:center;padding:4px 2px}.llm-sheet.searching .llm-addr,.llm-sheet.searching .llm-ok{display:none}' +
      '.llm-aico{flex:none;width:38px;height:38px;border-radius:12px;background:#fff1f2;display:flex;align-items:center;justify-content:center}' +
      '.llm-addr .t{min-width:0}.llm-addr b{display:block;font:800 15px "Plus Jakarta Sans",system-ui,sans-serif;color:#0f172a}' +
      '.llm-addr span{display:block;font:600 12.5px "Plus Jakarta Sans",system-ui,sans-serif;color:#6b7280;margin-top:2px}' +
      '.llm-ok{background:#0f172a;color:#fff;border:0;border-radius:14px;padding:15px;font:800 15px "Plus Jakarta Sans",system-ui,sans-serif;cursor:pointer;transition:transform .12s}.llm-ok:active{transform:scale(.98)}.llm-ok:disabled{opacity:.45;cursor:default}' +
      '.llm-pfab,.llm-fab{position:absolute;width:46px;height:46px;border-radius:9999px;background:#fff;border:0;box-shadow:0 4px 14px rgba(15,23,42,.28);cursor:pointer;display:flex;align-items:center;justify-content:center;color:#0f172a;z-index:1002}.llm-pfab{right:14px;top:-60px}.llm-pfab.on,.llm-fab.on{color:#1a73e8}' +
      '.llm-full .leaflet-control-zoom{display:none}' +
      '@media (min-width:768px){.llm-sheet{left:20px;right:auto;bottom:20px;width:420px;border-radius:24px;max-height:calc(100% - 40px)}.llm-grab{display:none}.llm-sheet{padding-top:18px}.llm-pfab{top:auto;right:-62px;bottom:0}.llm-full .leaflet-control-zoom{display:block;margin:0 20px 20px 0}}' +
      '.llm-poi{position:relative;width:28px;height:28px;cursor:pointer}.llm-poi img{width:28px;height:28px;display:block;filter:drop-shadow(0 1px 3px rgba(0,0,0,.35))}' +
      '.llm-poi span{position:absolute;left:31px;top:6px;white-space:nowrap;font:800 11.5px/1.1 "Plus Jakarta Sans",system-ui,sans-serif;text-shadow:-1.5px 0 #fff,1.5px 0 #fff,0 -1.5px #fff,0 1.5px #fff,-1px -1px #fff,1px 1px #fff,-1px 1px #fff,1px -1px #fff;pointer-events:none}' +
      '.llm-wrap{position:relative;isolation:isolate;overflow:hidden;background:#e5e7eb}' +
      '.leaflet-container{font-family:"Plus Jakarta Sans",system-ui,sans-serif}';
    document.head.appendChild(s);
  }


  /* ------------------------ landmark layers (vector only) ------------------------ */
  // Categories use the OpenMapTiles POI classes/subclasses. minz = first zoom where the icon may appear
  // (collision handling then drops the least important ones when crowded, so nothing clutters when zoomed out).
  var CATS = {
    lodging:   { color: '#d81b60', minz: 14,   keys: ['lodging', 'hotel', 'motel', 'guest_house', 'hostel', 'apartment'] },
    health:    { color: '#e53935', minz: 14,   keys: ['hospital', 'pharmacy', 'clinic', 'doctors', 'doctor', 'dentist'] },
    education: { color: '#00897b', minz: 14,   keys: ['school', 'college', 'university', 'kindergarten'] },
    worship:   { color: '#5c6bc0', minz: 14.5, keys: ['place_of_worship', 'church', 'mosque', 'temple', 'cathedral'] },
    landmark:  { color: '#43a047', minz: 14,   keys: ['stadium', 'cinema', 'theatre', 'museum', 'attraction', 'zoo', 'monument', 'park', 'playground', 'sports_centre', 'swimming', 'golf'] },
    transport: { color: '#1565c0', minz: 14.5, keys: ['bus', 'bus_station', 'bus_stop', 'railway', 'station', 'airport', 'taxi', 'harbor', 'ferry_terminal'] },
    food:      { color: '#f57c00', minz: 15,   keys: ['restaurant', 'fast_food', 'cafe', 'bar', 'pub', 'ice_cream', 'food_court', 'bakery'] },
    shopping:  { color: '#1e88e5', minz: 15,   keys: ['shop', 'supermarket', 'grocery', 'clothing_store', 'convenience', 'mall', 'department_store', 'marketplace'] },
    finance:   { color: '#2e7d32', minz: 15,   keys: ['bank', 'atm'] },
    fuel:      { color: '#3949ab', minz: 15,   keys: ['fuel'] },
    civic:     { color: '#6b7280', minz: 15,   keys: ['police', 'post', 'townhall', 'government', 'courthouse', 'fire_station', 'library'] }
  };
  var GLYPH = {
    lodging: function (c) { c.fillRect(4, 8, 2.5, 11); c.fillRect(4, 14, 16, 3); c.fillRect(8, 10, 5, 3.2); c.fillRect(14, 11, 6, 3); },
    food: function (c) { c.lineWidth = 1.8; c.lineCap = 'round'; c.beginPath(); c.moveTo(6.5, 5); c.lineTo(6.5, 9.5); c.moveTo(9.5, 5); c.lineTo(9.5, 9.5); c.moveTo(6.5, 9.5); c.quadraticCurveTo(8, 12, 9.5, 9.5); c.moveTo(8, 11.5); c.lineTo(8, 19); c.moveTo(15.5, 19); c.lineTo(15.5, 5); c.stroke(); c.beginPath(); c.moveTo(15.5, 5); c.quadraticCurveTo(19.5, 8, 15.5, 12.5); c.fill(); },
    health: function (c) { c.fillRect(10.2, 5, 3.6, 14); c.fillRect(5, 10.2, 14, 3.6); },
    worship: function (c) { c.fillRect(10.5, 4.5, 3, 15); c.fillRect(6.5, 8.5, 11, 3); },
    education: function (c, col) { c.beginPath(); c.moveTo(12, 6); c.lineTo(21, 10.5); c.lineTo(12, 15); c.lineTo(3, 10.5); c.closePath(); c.fill(); c.beginPath(); c.moveTo(7, 13); c.lineTo(7, 16.5); c.quadraticCurveTo(12, 20, 17, 16.5); c.lineTo(17, 13); c.lineTo(12, 15.6); c.closePath(); c.fill(); },
    shopping: function (c) { c.fillRect(6, 10, 12, 9); c.lineWidth = 1.8; c.beginPath(); c.arc(12, 10, 3.6, Math.PI, 0); c.stroke(); },
    finance: function (c) { c.beginPath(); c.moveTo(12, 5); c.lineTo(20, 9.5); c.lineTo(4, 9.5); c.closePath(); c.fill(); c.fillRect(6, 11, 2.4, 6); c.fillRect(10.8, 11, 2.4, 6); c.fillRect(15.6, 11, 2.4, 6); c.fillRect(4, 18, 16, 2); },
    fuel: function (c) { c.fillRect(6, 5, 8, 14); c.lineWidth = 1.8; c.lineCap = 'round'; c.beginPath(); c.moveTo(14, 9); c.lineTo(17, 9); c.lineTo(17, 15.5); c.stroke(); },
    transport: function (c, col) { c.fillRect(5, 5, 14, 12); c.beginPath(); c.arc(8.2, 19, 1.7, 0, 7); c.arc(15.8, 19, 1.7, 0, 7); c.fill(); c.fillStyle = col; c.fillRect(7, 7, 10, 4.5); },
    landmark: function (c) { c.beginPath(); for (var i = 0; i < 10; i++) { var r = i % 2 ? 4.2 : 8.5, a = -Math.PI / 2 + i * Math.PI / 5; c.lineTo(12 + r * Math.cos(a), 12.5 + r * Math.sin(a)); } c.closePath(); c.fill(); },
    civic: function (c) { c.fillRect(5, 11, 14, 8); c.beginPath(); c.moveTo(4, 11); c.lineTo(12, 4.5); c.lineTo(20, 11); c.closePath(); c.fill(); },
    other: function () {}
  };
  function iconData(cat, color) {
    var size = cat === 'other' ? 26 : 48, cv = document.createElement('canvas'); cv.width = cv.height = size;
    var c = cv.getContext('2d'), r = size / 2;
    c.fillStyle = color; c.strokeStyle = '#fff'; c.lineWidth = cat === 'other' ? 3 : 3.5;
    c.beginPath(); c.arc(r, r, r - 2.5, 0, 7); c.fill(); c.stroke();
    if (cat !== 'other') { c.save(); c.translate(r - 12 * 1.3, r - 12.4 * 1.3); c.scale(1.3, 1.3); c.fillStyle = '#fff'; c.strokeStyle = '#fff'; GLYPH[cat](c, color); c.restore(); }
    return c.getImageData(0, 0, size, size);
  }

  // Restyle the vector map: more recognisable landmarks, clearer streets/junctions/neighbourhoods.
  // Everything is defensive: any layer/field that is missing in the style is skipped, and if the new
  // landmark layers ever draw nothing while the tiles contain places, the original icons are switched back on.
  function enhance(gl) {
    var style = gl.getStyle && gl.getStyle(); if (!style || !style.layers) return;
    var poiSrc = null, font = null, origPoi = [];
    style.layers.forEach(function (l) {
      if (l.type !== 'symbol') return;
      if (!font && l.layout && l.layout['text-font']) font = l.layout['text-font'];
      if (l['source-layer'] === 'poi') { if (!poiSrc) poiSrc = l.source; origPoi.push(l.id); if (l.layout && l.layout['text-font']) font = l.layout['text-font']; }
    });
    function safe(fn) { try { fn(); } catch (e) {} }

    // 1) Streets and junction names: appear earlier, bigger, with a clean halo.
    style.layers.forEach(function (l) {
      if (l.type !== 'symbol') return;
      var sl = l['source-layer'], mz = l.minzoom || 0, xz = l.maxzoom || 24;
      if (sl === 'transportation_name') safe(function () {
        gl.setLayerZoomRange(l.id, Math.min(mz, 14), xz);
        gl.setLayoutProperty(l.id, 'text-size', ['interpolate', ['linear'], ['zoom'], 12, 10, 15, 12.5, 18, 15]);
        gl.setPaintProperty(l.id, 'text-halo-width', 1.8); gl.setPaintProperty(l.id, 'text-halo-color', '#ffffff');
      });
      if (sl === 'place') safe(function () {
        var f = JSON.stringify(l.filter || '');
        if (/suburb|neighbourhood|neighborhood|quarter|hamlet|locality|village/.test(f)) {
          gl.setLayerZoomRange(l.id, Math.min(mz, /neighbourhood|neighborhood|quarter|hamlet|locality/.test(f) ? 13 : 12), xz);
          gl.setLayoutProperty(l.id, 'text-transform', 'uppercase'); gl.setLayoutProperty(l.id, 'text-letter-spacing', 0.1);
          gl.setLayoutProperty(l.id, 'text-size', ['interpolate', ['linear'], ['zoom'], 12, 10.5, 16, 13]);
          gl.setPaintProperty(l.id, 'text-color', '#475569'); gl.setPaintProperty(l.id, 'text-halo-color', '#ffffff'); gl.setPaintProperty(l.id, 'text-halo-width', 1.6);
        }
      });
    });

    // 2) Landmarks: our own colour-coded icons replace the stock ones.
    if (!poiSrc) return;
    var mine = [];
    Object.keys(CATS).concat(['other']).forEach(function (cat) {
      safe(function () { gl.addImage('llm-' + cat, iconData(cat, cat === 'other' ? '#94a3b8' : CATS[cat].color), { pixelRatio: 2 }); });
    });
    var named = ['coalesce', ['get', 'name:latin'], ['get', 'name_en'], ['get', 'name']];
    var allKeys = [];
    Object.keys(CATS).forEach(function (cat) { allKeys = allKeys.concat(CATS[cat].keys); });
    function inKeys(keys) { return ['any', ['in', ['get', 'class'], ['literal', keys]], ['in', ['get', 'subclass'], ['literal', keys]]]; }
    function add(cat, filter, minz, color) {
      var id = 'llm-poi-' + cat;
      safe(function () {
        gl.addLayer({
          id: id, type: 'symbol', source: poiSrc, 'source-layer': 'poi', minzoom: minz, filter: ['all', ['has', 'name'], filter],
          layout: {
            'icon-image': 'llm-' + cat, 'icon-size': ['interpolate', ['linear'], ['zoom'], 13, 0.72, 16, 0.95, 19, 1.1], 'icon-allow-overlap': false, 'icon-padding': 3,
            'symbol-sort-key': ['coalesce', ['get', 'rank'], 99],
            'text-field': named, 'text-font': font || ['Noto Sans Regular'], 'text-optional': true,
            'text-size': ['interpolate', ['linear'], ['zoom'], 15, 0, 15.5, 11, 18, 13.5], 'text-max-width': 7,
            'text-variable-anchor': ['left', 'right', 'bottom', 'top'], 'text-radial-offset': 1.0, 'text-justify': 'auto'
          },
          paint: { 'text-color': color, 'text-halo-color': '#ffffff', 'text-halo-width': 1.6, 'text-halo-blur': 0.3 }
        });
        mine.push(id);
      });
    }
    Object.keys(CATS).forEach(function (cat) { add(cat, inKeys(CATS[cat].keys), CATS[cat].minz, CATS[cat].color); });
    // Anything else with a name: small grey dot, only when well zoomed in.
    add('other', ['!', inKeys(allKeys)], 16.5, '#64748b');
    origPoi.forEach(function (id) { safe(function () { gl.setLayoutProperty(id, 'visibility', 'none'); }); });
    gl._llPoi = mine;

    // 3) Safety net: if the tiles hold places but none of ours render at street zoom, restore the stock icons.
    var checks = 0;
    function verify() {
      if (checks > 6 || gl.getZoom() < 15.5) return; checks++;
      try {
        var has = gl.querySourceFeatures(poiSrc, { sourceLayer: 'poi' }).length;
        var drawn = gl.queryRenderedFeatures({ layers: mine }).length;
        if (has > 5 && !drawn) {
          mine.forEach(function (id) { safe(function () { gl.setLayoutProperty(id, 'visibility', 'none'); }); });
          origPoi.forEach(function (id) { safe(function () { gl.setLayoutProperty(id, 'visibility', 'visible'); }); });
          gl.off('idle', verify); gl._llPoi = [];
        } else if (drawn) gl.off('idle', verify);
      } catch (e) {}
    }
    gl.on('idle', verify);
  }

  // The landmark under a map click (vector map only): { name, lat, lng } or null.
  function poiAt(map, latlng) {
    var gl = map._llGl; if (!gl || !gl._llPoi || !gl._llPoi.length) return null;
    try {
      var p = gl.project([latlng.lng, latlng.lat]);
      var fs = gl.queryRenderedFeatures([[p.x - 14, p.y - 14], [p.x + 14, p.y + 14]], { layers: gl._llPoi });
      if (!fs.length) return null;
      var f = fs[0], pr = f.properties || {}, c = f.geometry && f.geometry.coordinates;
      if (!c) return null;
      return { name: pr['name:latin'] || pr.name_en || pr.name || 'Selected place', lat: c[1], lng: c[0] };
    } catch (e) { return null; }
  }


  /* ------------- landmark overlay: named places from OpenStreetMap (Overpass), any base map ------------- */
  // OpenStreetMap is the open data behind MapTiler, but the map tiles only carry a thin slice of it. This layer asks Overpass for
  // every NAMED hospital, hotel, church/mosque, school, restaurant, bank, fuel station, shop etc. in the visible area and draws our
  // colour-coded icons with names. Shown progressively by zoom; cached per area; thinned so nothing overlaps.
  var OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
  var OVQ = 'nwr["name"]["amenity"~"^(hospital|clinic|doctors|dentist|pharmacy|school|college|university|kindergarten|library|place_of_worship|bank|atm|restaurant|fast_food|cafe|bar|pub|fuel|police|fire_station|townhall|courthouse|post_office|bus_station|marketplace|cinema|theatre|nightclub|bureau_de_change)$"];' +
    'nwr["name"]["tourism"~"^(hotel|guest_house|hostel|motel|attraction|museum|gallery|apartment)$"];' +
    'nwr["name"]["shop"~"^(supermarket|mall|department_store|convenience|bakery|clothes|electronics|mobile_phone|hairdresser|beauty|car_repair)$"];' +
    'nwr["name"]["leisure"~"^(stadium|park|sports_centre|pitch|fitness_centre|garden)$"];' +
    'nwr["name"]["office"~"^(government|company|ngo)$"];' +
    'nwr["name"]["railway"="station"];nwr["name"]["aeroway"~"^(aerodrome|terminal)$"];';
  // [category (a CATS key), tier 1=most important … 3=only when zoomed right in]
  function poiKind(t) {
    var a = t.amenity, o = t.tourism, sh = t.shop, le = t.leisure;
    if (a === 'hospital') return ['health', 1];
    if (a === 'clinic' || a === 'doctors' || a === 'dentist' || a === 'pharmacy') return ['health', 2];
    if (a === 'school' || a === 'college' || a === 'university') return ['education', 1];
    if (a === 'kindergarten' || a === 'library') return ['education', 2];
    if (a === 'place_of_worship') return ['worship', 1];
    if (a === 'bank') return ['finance', 2]; if (a === 'atm' || a === 'bureau_de_change') return ['finance', 3];
    if (a === 'restaurant' || a === 'cafe') return ['food', 2]; if (a === 'fast_food' || a === 'bar' || a === 'pub' || a === 'nightclub') return ['food', 2];
    if (a === 'fuel') return ['fuel', 2];
    if (a === 'police' || a === 'fire_station' || a === 'townhall' || a === 'courthouse') return ['civic', 1];
    if (a === 'post_office') return ['civic', 2];
    if (a === 'bus_station') return ['transport', 1];
    if (a === 'marketplace') return ['shopping', 1];
    if (a === 'cinema' || a === 'theatre') return ['landmark', 2];
    if (o === 'hotel') return ['lodging', 1]; if (o === 'guest_house' || o === 'hostel' || o === 'motel' || o === 'apartment') return ['lodging', 2];
    if (o === 'attraction' || o === 'museum' || o === 'gallery') return ['landmark', 2];
    if (sh === 'supermarket' || sh === 'mall' || sh === 'department_store') return ['shopping', 2]; if (sh) return ['shopping', 3];
    if (le === 'stadium') return ['landmark', 1]; if (le === 'park' || le === 'sports_centre' || le === 'garden') return ['landmark', 2]; if (le) return ['landmark', 3];
    if (t.office) return ['civic', 3];
    if (t.railway || t.aeroway) return ['transport', 1];
    return null;
  }
  var iconUrls = {};
  function iconUrl(cat) { if (!iconUrls[cat]) { var d = iconData(cat, CATS[cat].color), c = document.createElement('canvas'); c.width = d.width; c.height = d.height; c.getContext('2d').putImageData(d, 0, 0); iconUrls[cat] = c.toDataURL(); } return iconUrls[cat]; }

  function landmarks(L, map) {
    css();
    var feats = {}, shown = {}, loadedCells = {}, tm = null, busy = false, CELL = 0.012, MINZ = 14, ep = 0;
    var layer = L.layerGroup().addTo(map);
    function cell(lat, lng) { return Math.floor(lat / CELL) + ':' + Math.floor(lng / CELL); }

    function fetchBox(s, w, n, e) {
      var q = '[out:json][timeout:25];(' + OVQ.replace(/;(?=nwr|$)/g, '(' + [s, w, n, e].join(',') + ');') + ');out center tags 600;';
      function go(i) {
        if (i >= OVERPASS.length) return Promise.reject(new Error('Overpass unavailable'));
        var url = OVERPASS[(ep + i) % OVERPASS.length];
        return fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
          .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
          .then(function (j) { ep = (ep + i) % OVERPASS.length; return j; }, function () { return go(i + 1); });
      }
      return go(0);
    }

    function load() {
      if (busy || map.getZoom() < MINZ) return;
      var b = map.getBounds().pad(0.15), need = [], seen = {};
      for (var la = Math.floor(b.getSouth() / CELL); la <= Math.floor(b.getNorth() / CELL); la++) {
        for (var ln = Math.floor(b.getWest() / CELL); ln <= Math.floor(b.getEast() / CELL); ln++) { var k = la + ':' + ln; if (!loadedCells[k]) { need.push([la, ln]); seen[k] = 1; } }
      }
      if (!need.length || need.length > 40) { if (need.length > 40) return; render(); return; }
      var s = Math.min.apply(null, need.map(function (c) { return c[0]; })) * CELL, n = (Math.max.apply(null, need.map(function (c) { return c[0]; })) + 1) * CELL;
      var w = Math.min.apply(null, need.map(function (c) { return c[1]; })) * CELL, e = (Math.max.apply(null, need.map(function (c) { return c[1]; })) + 1) * CELL;
      busy = true;
      fetchBox(s, w, n, e).then(function (j) {
        (j.elements || []).forEach(function (el) {
          var t = el.tags || {}, kind = poiKind(t); if (!kind || !t.name) return;
          var lat = el.lat != null ? el.lat : (el.center && el.center.lat), lng = el.lon != null ? el.lon : (el.center && el.center.lon);
          if (lat == null) return;
          feats[el.type + el.id] = { id: el.type + el.id, lat: lat, lng: lng, name: t['name:en'] || t.name, cat: kind[0], tier: kind[1] };
        });
        need.forEach(function (c) { loadedCells[c[0] + ':' + c[1]] = 1; });
      }).catch(function () { /* offline or Overpass busy: try again on the next move */ }).then(function () { busy = false; render(); });
    }

    // Draw by zoom, biggest/most important first, skipping anything that would sit on top of something already drawn.
    function render() {
      var z = map.getZoom(); if (z < MINZ) { clear(); return; }
      var b = map.getBounds().pad(0.05), list = [];
      Object.keys(feats).forEach(function (k) {
        var f = feats[k]; if (!b.contains([f.lat, f.lng])) return;
        var minZ = f.tier === 1 ? 14 : f.tier === 2 ? 15.5 : 17; if (z < minZ) return; list.push(f);
      });
      list.sort(function (a, c) { return a.tier - c.tier; });
      var used = [], gap = z >= 17 ? 30 : 38, want = {};
      list.forEach(function (f) {
        var p = map.latLngToLayerPoint([f.lat, f.lng]), ok = true;
        for (var i = 0; i < used.length; i++) { if (Math.abs(used[i].x - p.x) < gap && Math.abs(used[i].y - p.y) < gap) { ok = false; break; } }
        if (!ok) return; used.push(p); want[f.id] = (z >= (f.tier === 1 ? 15.5 : f.tier === 2 ? 16.5 : 17.5));
      });
      Object.keys(shown).forEach(function (id) { if (!(id in want)) { layer.removeLayer(shown[id].m); delete shown[id]; } });
      Object.keys(want).forEach(function (id) {
        var f = feats[id], lab = want[id];
        if (shown[id]) { if (shown[id].lab !== lab) { shown[id].m.setIcon(icon(f, lab)); shown[id].lab = lab; } return; }
        var m = L.marker([f.lat, f.lng], { icon: icon(f, lab), keyboard: false, riseOnHover: true, title: f.name });
        m.on('click', function (e) { if (e.originalEvent) L.DomEvent.stopPropagation(e); map.fire('llm:poi', { name: f.name, lat: f.lat, lng: f.lng, cat: f.cat }); });
        m.addTo(layer); shown[id] = { m: m, lab: lab };
      });
    }
    function icon(f, lab) {
      var col = CATS[f.cat].color;
      return L.divIcon({ className: '', iconSize: [28, 28], iconAnchor: [14, 14], html: '<div class="llm-poi"><img alt="" src="' + iconUrl(f.cat) + '">' + (lab ? '<span style="color:' + col + '">' + String(f.name).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }) + '</span>' : '') + '</div>' });
    }
    function clear() { Object.keys(shown).forEach(function (id) { layer.removeLayer(shown[id].m); }); shown = {}; }
    map.on('moveend zoomend', function () { render(); clearTimeout(tm); tm = setTimeout(load, 450); });
    map.on('zoomstart', function () { /* keep icons while zooming */ });
    tm = setTimeout(load, 300);
    return { reload: function () { loadedCells = {}; load(); }, feats: feats };
  }

  // Creates a map in `el`. Resolves to { L, map, vector }.
  function create(el, opts) {
    opts = opts || {};
    css();
    return load().then(function (L) {
      var key = cfgKey();
      if (!key) throw new Error('The map is not configured yet (maptilerKey is missing in supabase-config.js).');
      var wantVector = opts.vector === true || /[?&]vector=1/.test(location.search);
      return (wantVector ? loadVector() : Promise.resolve(false)).then(function (vec) {
        var map = L.map(el, { zoomControl: false, attributionControl: true, zoomSnap: 0.5, zoomDelta: 1, wheelPxPerZoomLevel: 90, fadeAnimation: true, markerZoomAnimation: true })
          .setView(opts.center || BENIN, opts.zoom || 14);
        L.control.zoom({ position: opts.zoomPosition || 'topright' }).addTo(map);
        var base = null, usedVector = false;
        function useRaster() {
          if (base) { try { map.removeLayer(base); } catch (e) {} }
          usedVector = false;
          base = rasterLayer(L, key).addTo(map);
          var shown = false;
          base.on('tileerror', function () {
            if (shown) return; shown = true;
            note(el, 'Map tiles could not be loaded. The MapTiler key may be wrong, restricted to another website address, or out of quota.');
          });
        }
        if (vec) {
          try {
            usedVector = true;
            base = L.maplibreGL({ style: 'https://api.maptiler.com/maps/streets-v2/style.json?key=' + encodeURIComponent(key), attribution: ATTR, padding: 0.3 }).addTo(map);
            var gl = base.getMaplibreMap && base.getMaplibreMap();
            if (gl && gl.on) {
              var ready = false;
              map._llGl = gl;
              gl.on('load', function () { ready = true; try { enhance(gl); } catch (e) {} });
              if (gl.isStyleLoaded && gl.isStyleLoaded()) { ready = true; try { enhance(gl); } catch (e) {} }
              gl.on('error', function (e) {
                // Before the first render, any style/tile failure (bad key, blocked origin, offline) -> use the raster layer instead.
                if (!ready && usedVector) { useRaster(); }
              });
            }
          } catch (e) { useRaster(); }
        } else { useRaster(); }
        if (!usedVector) { try { landmarks(L, map); } catch (e) {} }
        // Container size can change after first paint (hidden panels, mobile browser bars).
        if (window.ResizeObserver) { try { new ResizeObserver(function () { map.invalidateSize({ animate: false }); }).observe(el); } catch (e) {} }
        return { L: L, map: map, vector: usedVector };
      });
    });
  }


  /* ----------------------------- markers ----------------------------- */
  var SVG_HOME = '<svg viewBox="0 0 34 42" class="llm-drop"><path d="M17 41C17 41 2 26 2 15a15 15 0 0 1 30 0c0 11-15 26-15 26z" fill="#e11d48" stroke="#fff" stroke-width="2.5"/><path d="M10.5 16.5 17 10.5l6.5 6v7.5h-4.4v-4.6h-4.2V24h-4.4z" fill="#fff"/></svg>';
  var SVG_VEH = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17h14M3 13l2-5a2 2 0 0 1 1.9-1.3h10.2A2 2 0 0 1 19 8l2 5v4h-2"/><circle cx="7.5" cy="17" r="1.8" fill="#fff"/><circle cx="16.5" cy="17" r="1.8" fill="#fff"/></svg>';

  // Kinds are chosen from the letter the pages already pass: J = job, P = provider, C = customer, anything else = plain dot.
  function marker(L, latlng, color, letter, title) {
    css();
    var icon;
    if (letter === 'J') icon = L.divIcon({ className: '', iconSize: [34, 42], iconAnchor: [17, 40], html: SVG_HOME });
    else if (letter === 'P') icon = L.divIcon({ className: '', iconSize: [38, 38], iconAnchor: [19, 19], html: '<div class="llm-veh" style="background:' + color + '">' + SVG_VEH + '</div>' });
    else if (letter === 'C' || letter === 'ME') icon = L.divIcon({ className: '', iconSize: [22, 22], iconAnchor: [11, 11], html: '<div class="llm-me"><i></i><b></b></div>' });
    else icon = L.divIcon({ className: '', iconSize: [22, 22], iconAnchor: [11, 11], html: '<div class="llm-pulse" style="--c:' + color + '"><i></i><b></b></div>' });
    return L.marker(latlng, { icon: icon, title: title || '', riseOnHover: true, keyboard: false });
  }

  // Glide a marker to a new position (smooth live tracking instead of jumping).
  function moveTo(m, latlng, ms) {
    ms = ms || 1200;
    var from = m.getLatLng(), to = L_.latLng(latlng);
    if (m._llAnim) cancelAnimationFrame(m._llAnim);
    var d = from.distanceTo(to);
    if (d < 0.5 || d > 5000) { m.setLatLng(to); return; }
    var t0 = performance.now();
    (function step(t) {
      var k = Math.min(1, (t - t0) / ms), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      m.setLatLng([from.lat + (to.lat - from.lat) * e, from.lng + (to.lng - from.lng) * e]);
      if (k < 1) m._llAnim = requestAnimationFrame(step);
    })(t0);
  }
  var L_ = { latLng: function (a) { return window.L.latLng(a); } };

  /* ---------------------------- geocoding ---------------------------- */
  function geoUrl(path, extra) {
    var key = cfgKey();
    return 'https://api.maptiler.com/geocoding/' + path + '.json?key=' + encodeURIComponent(key) + '&language=en' + (extra || '');
  }
  function getJson(url) {
    return fetch(url).then(function (r) { if (!r.ok) throw new Error('Address lookup failed (' + r.status + ').'); return r.json(); });
  }
  function shape(f) {
    var ctx = (f.context || []).map(function (c) { return c.text; }).filter(Boolean);
    var title = (f.address ? f.address + ' ' : '') + (f.text || '');
    var parts = String(f.place_name || '').split(',').map(function (s) { return s.trim(); });
    return { title: title || parts[0] || 'Selected place', sub: ctx.slice(0, 3).join(', '), lat: f.center[1], lng: f.center[0], bbox: f.bbox || null, full: f.place_name || title };
  }
  // Forward search: biased to Nigeria and to the current map centre.
  function search(q, near) {
    q = String(q || '').trim(); if (q.length < 2) return Promise.resolve([]);
    var prox = near ? '&proximity=' + near.lng + ',' + near.lat : '';
    return getJson(geoUrl(encodeURIComponent(q), '&country=ng&autocomplete=true&limit=7' + prox)).then(function (j) { return (j.features || []).map(shape); });
  }
  // Reverse: { street, area, city, line } for a coordinate. Never rejects (resolves null if unavailable).
  var revCache = {};
  function reverse(lat, lng) {
    var k = lat.toFixed(5) + ',' + lng.toFixed(5);
    if (revCache[k]) return Promise.resolve(revCache[k]);
    return getJson(geoUrl(lng + ',' + lat, '&limit=5')).then(function (j) {
      var fs = j.features || [];
      if (!fs.length) return null;
      var street = null, area = null, city = null, streetOnly = null, poi = null;
      fs.forEach(function (f) {
        var t = (f.place_type || [])[0];
        if (!streetOnly && (t === 'address' || t === 'street')) streetOnly = ((f.address ? f.address + ' ' : '') + f.text).trim();
        if (!poi && t === 'poi') poi = f.text;
        if (!street && (t === 'address' || t === 'street' || t === 'poi')) street = ((f.address ? f.address + ' ' : '') + f.text).trim();
        if (!area && (t === 'neighbourhood' || t === 'neighborhood' || t === 'locality' || t === 'suburb' || t === 'municipality')) area = f.text;
        if (!city && (t === 'place' || t === 'municipality' || t === 'county' || t === 'region')) city = f.text;
      });
      var top = fs[0], ctx = (top.context || []).map(function (c) { return c.text; });
      if (!street) street = top.text;
      if (!area) area = ctx[0] || null;
      if (!city) city = ctx[1] || ctx[0] || null;
      var out = { hasStreet: !!streetOnly, streetName: streetOnly || '', poi: poi || '', street: street, area: area && area !== street ? area : (ctx[0] || ''), city: city || '', line: [street, area, city].filter(function (x, i, a) { return x && a.indexOf(x) === i; }).join(', ') };
      revCache[k] = out; return out;
    }).catch(function () { return null; });
  }

  // Nearest named place (shop, church, school...) within ~150 m of a point, for "near X" text. Never rejects (null if none).
  var lmCache = {};
  function landmark(lat, lng) {
    var k = lat.toFixed(4) + ',' + lng.toFixed(4);
    if (lmCache[k] !== undefined) return Promise.resolve(lmCache[k]);
    return getJson(geoUrl(lng + ',' + lat, '&types=poi&limit=3')).then(function (j) {
      var best = null, bd = 1e9;
      (j.features || []).forEach(function (f) {
        if (!f.center || !f.text) return;
        var d = metres(lat, lng, f.center[1], f.center[0]);
        if (d < bd) { bd = d; best = f; }
      });
      var out = best && bd <= 150 ? { name: best.text, distance: Math.round(bd) } : null;
      lmCache[k] = out; return out;
    }).catch(function () { return null; });
  }

  /* ------------------ current-location dot + accuracy circle ------------------ */
  // Draws a Google-style blue dot with a soft circle showing GPS accuracy. Returns { stop, once(cb), set(lat,lng,acc) }.
  function me(L, map, opts) {
    opts = opts || {};
    var dot = null, ring = null, wid = null, first = true;
    function set(lat, lng, acc) {
      var ll = [lat, lng];
      if (!dot) {
        ring = L.circle(ll, { radius: acc || 30, color: '#1a73e8', weight: 1, opacity: .5, fillColor: '#1a73e8', fillOpacity: .14, interactive: false }).addTo(map);
        dot = marker(L, ll, '#1a73e8', 'ME', 'You are here').addTo(map); dot.options.interactive = false;
      } else { dot.setLatLng(ll); ring.setLatLng(ll); ring.setRadius(acc || 30); }
    }
    function start(onFix, onErr) {
      if (!navigator.geolocation) { if (onErr) onErr({ code: 0 }); return; }
      if (wid != null) navigator.geolocation.clearWatch(wid);
      wid = navigator.geolocation.watchPosition(function (p) {
        set(p.coords.latitude, p.coords.longitude, p.coords.accuracy);
        if (onFix) onFix(p, first); first = false;
      }, function (e) { if (onErr) onErr(e); }, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
    }
    return {
      start: start, set: set,
      stop: function () { if (wid != null) navigator.geolocation.clearWatch(wid); wid = null; if (dot) { map.removeLayer(dot); map.removeLayer(ring); dot = ring = null; } }
    };
  }

  /* ------------------------ full-screen, Bolt-style picker ------------------------ */
  // picker({ initial:{lat,lng}, title, confirmText, onConfirm(pin{lat,lng,street,area,city,line}), onClose })
  // Map fills the screen; the pin stays in the middle while you move the map; a bottom sheet holds search, the address and Confirm.
  // On a wide screen the sheet floats at the bottom-left instead of spanning the width (same layout, desktop friendly).
  function pickerModal(opts) {
    opts = opts || {};
    css();
    var root = document.createElement('div'); root.className = 'llm-full';
    var mapEl = document.createElement('div'); mapEl.style.cssText = 'position:absolute;inset:0'; root.appendChild(mapEl);
    document.body.appendChild(root); document.documentElement.style.overflow = 'hidden';
    var closed = false;
    function close() { if (closed) return; closed = true; try { loc.stop(); } catch (e) {} try { map.remove(); } catch (e) {} root.remove(); document.documentElement.style.overflow = ''; document.removeEventListener('keydown', onKey); if (opts.onClose) opts.onClose(); }
    function onKey(e) { if (e.key === 'Escape') { if (!res.hidden) hide(); else close(); } }
    var map = null, loc = null, res = null, hide = function () {};
    return create(mapEl, { center: opts.initial ? [opts.initial.lat, opts.initial.lng] : BENIN, zoom: opts.initial ? 17 : 15.5 }).then(function (m) {
      map = m.map; var L = m.L, addr = null, seq = 0, tmr = null; loc = me(L, map);
      var shadow = document.createElement('div'); shadow.className = 'llm-shadow';
      var center = document.createElement('div'); center.className = 'llm-center'; center.innerHTML = SVG_HOME.replace('class="llm-drop"', 'width="42" height="52" style="filter:drop-shadow(0 4px 5px rgba(0,0,0,.35))"');
      var back = document.createElement('button'); back.type = 'button'; back.className = 'llm-back'; back.setAttribute('aria-label', 'Close map');
      back.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';
      var sheet = document.createElement('div'); sheet.className = 'llm-sheet';
      sheet.innerHTML =
        '<button type="button" class="llm-pfab" aria-label="Use my current location"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="3.5" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="8"/></svg></button>' +
        '<div class="llm-grab"></div><p class="llm-title"></p>' +
        '<div class="llm-sbox"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input type="search" autocomplete="off" placeholder="Search street, area or landmark" aria-label="Search for an address"></div>' +
        '<div class="llm-results" hidden></div>' +
        '<div class="llm-addr"><div class="llm-aico"><svg width="18" height="18" viewBox="0 0 24 24" fill="#e11d48"><path d="M12 22s7-6.4 7-12a7 7 0 1 0-14 0c0 5.6 7 12 7 12z"/><circle cx="12" cy="10" r="2.6" fill="#fff"/></svg></div><div class="t"><b>Move the map to the exact spot</b><span>Street and area appear here</span></div></div>' +
        '<button type="button" class="llm-ok"></button>';
      [shadow, center, back, sheet].forEach(function (n) { root.appendChild(n); });
      [back, sheet].forEach(function (n) { L.DomEvent.disableClickPropagation(n); L.DomEvent.disableScrollPropagation(n); });
      sheet.querySelector('.llm-title').textContent = opts.title || 'Where is the job?';
      var input = sheet.querySelector('input'), fab = sheet.querySelector('.llm-pfab'), tB = sheet.querySelector('.t b'), tS = sheet.querySelector('.t span'), ok = sheet.querySelector('.llm-ok'), addrBox = sheet.querySelector('.llm-addr');
      res = sheet.querySelector('.llm-results'); ok.textContent = opts.confirmText || 'Confirm this location';
      back.onclick = close; document.addEventListener('keydown', onKey);

      function paint(a, busy) {
        if (busy) { tB.textContent = 'Finding address…'; tS.textContent = ''; return; }
        if (a) { tB.textContent = a.street || 'Pinned location'; tS.textContent = [a.area, a.city].filter(Boolean).join(', '); }
        else { var c = map.getCenter(); tB.textContent = 'Pinned location'; tS.textContent = c.lat.toFixed(5) + ', ' + c.lng.toFixed(5) + ' (street name unavailable)'; }
      }
      function lookup() { var c = map.getCenter(), my = ++seq; paint(null, true); ok.disabled = true; reverse(c.lat, c.lng).then(function (a) { if (my !== seq) return; addr = a; paint(a); ok.disabled = false; }); }
      map.on('movestart', function () { root.classList.add('llm-moving'); });
      map.on('moveend', function () { root.classList.remove('llm-moving'); clearTimeout(tmr); tmr = setTimeout(lookup, 250); });

      function fly(lat, lng, z) { map.flyTo([lat, lng], z || 17, { duration: 0.9 }); }
      var lastFix = null;
      fab.onclick = function () {
        fab.classList.add('on');
        if (lastFix) { fly(lastFix[0], lastFix[1], 17.5); return; }
        loc.start(function (p, first) { lastFix = [p.coords.latitude, p.coords.longitude]; if (first) fly(lastFix[0], lastFix[1], 17.5); }, function (err) {
          fab.classList.remove('on');
          note(root, err && err.code === 1 ? 'Location permission is off. Allow location for this site, or search for the address.' : 'Could not get your location. Search for the address instead.');
        });
      };

      // Search (results replace the address card inside the sheet)
      var stm = null, sseq = 0, items = [], idx = -1;
      hide = function () { res.hidden = true; res.innerHTML = ''; items = []; idx = -1; sheet.classList.remove('searching'); };
      function pick(r) {
        input.value = r.title + (r.sub ? ', ' + r.sub : ''); hide(); input.blur();
        if (r.bbox && r.bbox.length === 4 && Math.abs(r.bbox[2] - r.bbox[0]) > 0.003) map.flyToBounds([[r.bbox[1], r.bbox[0]], [r.bbox[3], r.bbox[2]]], { maxZoom: 17, duration: 0.9 });
        else fly(r.lat, r.lng, 17);
      }
      function show(rows) {
        items = rows; idx = -1; res.innerHTML = ''; sheet.classList.add('searching');
        if (!rows.length) { var p = document.createElement('div'); p.className = 'llm-none'; p.textContent = 'No matches. Try a nearby street or landmark.'; res.appendChild(p); res.hidden = false; return; }
        rows.forEach(function (r) {
          var b = document.createElement('button'); b.type = 'button';
          var t = document.createElement('b'); t.textContent = r.title; var sp = document.createElement('span'); sp.textContent = r.sub;
          b.appendChild(t); b.appendChild(sp); b.onclick = function () { pick(r); }; res.appendChild(b);
        });
        res.hidden = false;
      }
      input.addEventListener('input', function () {
        clearTimeout(stm); var q = input.value;
        if (q.trim().length < 3) { hide(); return; }
        stm = setTimeout(function () {
          var my = ++sseq, c = map.getCenter();
          search(q, { lat: c.lat, lng: c.lng }).then(function (rows) { if (my === sseq) show(rows); }, function (e) { if (my === sseq) { show([]); res.firstChild.textContent = e.message; } });
        }, 300);
      });
      input.addEventListener('keydown', function (e) {
        var bs = res.querySelectorAll('button');
        if (e.key === 'ArrowDown' && bs.length) { e.preventDefault(); idx = (idx + 1) % bs.length; }
        else if (e.key === 'ArrowUp' && bs.length) { e.preventDefault(); idx = (idx - 1 + bs.length) % bs.length; }
        else if (e.key === 'Enter') { e.preventDefault(); if (items.length) pick(items[idx >= 0 ? idx : 0]); return; }
        else return;
        bs.forEach(function (b, i) { b.classList.toggle('on', i === idx); });
      });

      ok.onclick = function () {
        var c = map.getCenter(), a = addr || {};
        var pin = { lat: Math.round(c.lat * 1e6) / 1e6, lng: Math.round(c.lng * 1e6) / 1e6, street: a.street || '', area: a.area || '', city: a.city || '', line: a.line || '' };
        if (opts.onConfirm) opts.onConfirm(pin);
        close();
      };
      // Centre on the device straight away only if location permission was already granted (no surprise prompt).
      // Tapping a landmark on the map jumps to it and shows its name.
      map.on('llm:poi', function (p) { input.value = p.name; fly(p.lat, p.lng, 18); });
      map.on('click', function (e) { var p = poiAt(map, e.latlng); if (p) { input.value = p.name; fly(p.lat, p.lng, 18); } });
      if (opts.locate || opts.autoLocate) fab.click();
      else if (!opts.initial && navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: 'geolocation' }).then(function (st) { if (st.state === 'granted') fab.click(); }).catch(function () {});
      }
      setTimeout(function () { map.invalidateSize({ animate: false }); lookup(); }, 60);
      return { close: close, map: map, L: L };
    }, function (e) { close(); throw e; });
  }

  /* --------------------------- live sharing --------------------------- */
  // Share this device's location for a booking. Returns { stop }.
  //  - Android app: uses the phone's native location service in a foreground service, so it keeps working with the screen locked
  //    (Android shows a "LifeLink is sharing your location" notice while it runs).
  //  - Browser / iPhone site: uses the browser's location, which only works while the page is open and the screen is on.
  // Quality: stale readings are dropped, weak readings never replace a good one, impossible jumps are ignored, and a light filter smooths
  // the dot. It sends about every 4 s while moving and every 15 s when standing still. Failures only change the status text;
  // they never raise penalties server-side.
  var SHARE_MSG = 'LifeLink is sharing your location for your active booking.';
  var BGP;
  function nativeGeo() {
    var cap = window.Capacitor;
    if (!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform())) return null;
    if (BGP !== undefined) return BGP;
    try { BGP = (cap.registerPlugin && cap.registerPlugin('BackgroundGeolocation')) || (cap.Plugins && cap.Plugins.BackgroundGeolocation) || null; } catch (e) { BGP = null; }
    return BGP;
  }
  function metres(aLat, aLng, bLat, bLng) {
    var R = 6371000, r = Math.PI / 180, dLat = (bLat - aLat) * r, dLng = (bLng - aLng) * r;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
  }
  function share(bookingId, onStatus, every) {
    var MOVE_MS = every || 4000, IDLE_MS = 15000;
    var est = null, lastSent = null, streak = 0, startedAt = Date.now(), stopped = false, wid = null, bg = null, bgId = null, sending = false;
    function say(kind, msg, extra) { if (onStatus && !stopped) onStatus(kind, msg, extra); }
    function stop() {
      stopped = true;
      if (wid != null && navigator.geolocation) navigator.geolocation.clearWatch(wid);
      if (bg && bgId != null) { try { bg.removeWatcher({ id: bgId }); } catch (e) {} }
    }

    // One reading in; decides whether it is trustworthy, smooths it, and sends it when it is time.
    function onFix(f) {
      if (stopped) return;
      var now = Date.now(), acc = (f.acc == null || isNaN(f.acc)) ? 999 : Math.max(1, f.acc);
      if (now - f.time > 20000) return;                                   // cached/old reading: never show it as "live"
      if (!est) {
        // First reading: rough ones (cell towers / Wi-Fi) are skipped for a short while so the dot does not start in the wrong street.
        if (acc > 150 && now - startedAt < 25000) { say('warn', 'Finding your exact position…'); return; }
        est = { lat: f.lat, lng: f.lng, acc: acc, t: f.time };
      } else {
        var dt = Math.max(0.2, (f.time - est.t) / 1000), jump = metres(est.lat, est.lng, f.lat, f.lng);
        if (f.time <= est.t) return;                                      // out-of-order reading
        if (jump / dt > 60 && acc > 30 && streak < 2) { streak++; return; }   // faster than 200 km/h with a weak signal: a glitch, ignore (but accept if it keeps happening)
        streak = 0;
        if (acc > Math.max(60, est.acc * 2.5) && f.time - est.t < 15000) return;   // noisy reading while we already know better
        // Light 1-D Kalman filter: trust precise readings, damp noisy ones.
        var q = Math.max(3, f.speed || 0), P = est.acc * est.acc + dt * q * q, R = acc * acc, K = P / (P + R);
        est = { lat: est.lat + K * (f.lat - est.lat), lng: est.lng + K * (f.lng - est.lng), acc: Math.max(3, Math.sqrt((1 - K) * P)), t: f.time };
      }
      var moved = lastSent ? metres(lastSent.lat, lastSent.lng, est.lat, est.lng) : 1e9, since = lastSent ? now - lastSent.at : 1e9;
      var due = !lastSent || (since >= MOVE_MS && moved >= 8) || since >= IDLE_MS;
      if (!due || sending) return;
      sending = true; lastSent = { lat: est.lat, lng: est.lng, at: now };
      LLApi.tracking.pushLocation(bookingId, est.lat, est.lng, est.acc, new Date(Math.min(f.time, now)).toISOString()).then(function (r) {
        sending = false;
        var weak = est.acc > 50, d = r && r.distance_m != null ? ' · about ' + r.distance_m + ' m from the job' : '';
        if (weak) say('warn', 'GPS signal is weak (about ' + Math.round(est.acc) + ' m). Move into the open for a better fix.' + d, r);
        else say('ok', 'Sharing your exact location' + d, r);
      }, function (e) {
        sending = false;
        var m = (e && e.message) || '';
        if (/only shared while/i.test(m)) { say('ok', 'Location sharing has ended.'); stop(); return; }   // job started, finished or cancelled: stop the background service too
        say('error', m || 'Could not send your location.');
      });
    }

    function startWeb() {
      if (!navigator.geolocation) { say('error', 'This device cannot share its location.'); return; }
      wid = navigator.geolocation.watchPosition(function (pos) {
        onFix({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy, time: pos.timestamp || Date.now(), speed: pos.coords.speed });
      }, function (err) {
        say('error', err && err.code === 1 ? 'Location permission is off. Allow location for this site to share your position.' : 'Your phone has no GPS signal right now.');
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
    }

    bg = nativeGeo();
    if (bg && bg.addWatcher) {
      bg.addWatcher({ backgroundTitle: 'LifeLink is sharing your location', backgroundMessage: SHARE_MSG, requestPermissions: true, distanceFilter: 0, stale: false }, function (loc, err) {
        if (stopped) return;
        if (err) {
          if (err.code === 'NOT_AUTHORIZED') {
            say('error', 'Location permission is off. Tap here to open settings and allow location for LifeLink.', { openSettings: function () { try { bg.openSettings(); } catch (e) {} } });
          } else say('error', 'Your phone has no GPS signal right now.');
          return;
        }
        if (!loc) return;
        if (loc.simulated === true) { say('warn', 'A fake (mock) location is turned on. Turn it off so your real position can be shared.'); return; }
        onFix({ lat: loc.latitude, lng: loc.longitude, acc: loc.accuracy, time: loc.time || Date.now(), speed: loc.speed });
      }).then(function (id) { if (stopped) { try { bg.removeWatcher({ id: id }); } catch (e) {} } else bgId = id; },
              function () { if (!stopped) { bg = null; startWeb(); } });   // plugin missing in this build: fall back to the browser location
    } else startWeb();
    return { stop: stop };
  }

  window.LLMap = { BENIN: BENIN, load: load, create: create, marker: marker, moveTo: moveTo, me: me, poiAt: poiAt, search: search, reverse: reverse, landmark: landmark, pickerModal: pickerModal, picker: pickerModal, share: share };
})();
