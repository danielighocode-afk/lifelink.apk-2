/* LifeLink search helper: suggestions while the person types.
   - Suggests categories, provider names and skills (pages feed them with LLSuggest.add), plus a short list of popular searches.
   - Understands related words: "pipe leak" suggests Plumber, "wiring" suggests Electrician, and so on.
   - Shows recent searches when the box is focused and empty.
   - Works with the keyboard (arrows, Enter, Escape) and with touch. Uses only the page's own colours (var(--ll-*)).
   Use: LLSuggest.attach(inputElement, { onPick: function (item) {} });  LLSuggest.add(['Plumber', 'Electrician'], 'Category'); */
(function () {
  'use strict';
  if (window.LLSuggest) return;

  var POPULAR = ['Plumber', 'Electrician', 'Hair braiding', 'Barber', 'Makeup artist', 'Phone repair', 'Laptop repair', 'AC repair', 'Generator repair', 'Car mechanic', 'House cleaning', 'Laundry', 'Painter', 'Carpenter', 'Tiler', 'POP ceiling', 'CCTV installation', 'Tailor', 'Photographer', 'Caterer', 'Home tutor', 'Movers'];
  // related words: when a label contains the key, the words after it also find that label
  var SYN = {
    plumb: ['pipe', 'leak', 'tap', 'drain', 'drainage', 'toilet', 'sink', 'water', 'borehole', 'tank'],
    electric: ['wiring', 'light', 'socket', 'power', 'inverter', 'solar', 'fan', 'bulb', 'cable'],
    hair: ['braids', 'braid', 'weave', 'wig', 'salon', 'natural hair', 'locs'],
    barber: ['haircut', 'cut', 'trim', 'shave', 'fade'],
    makeup: ['beauty', 'bridal', 'gele', 'glam'],
    phone: ['screen', 'battery', 'iphone', 'android', 'samsung', 'charging'],
    laptop: ['computer', 'pc', 'software', 'windows', 'screen'],
    computer: ['laptop', 'pc', 'software', 'network', 'wifi'],
    'ac ': ['air conditioner', 'cooling', 'fridge', 'freezer', 'cold'],
    generator: ['gen', 'power', 'petrol', 'diesel', 'light'],
    mechanic: ['car', 'engine', 'brake', 'tyre', 'tire', 'auto', 'vehicle', 'gearbox', 'service'],
    clean: ['cleaner', 'wash', 'sweep', 'fumigation', 'dust', 'office'],
    laundry: ['wash', 'iron', 'dry clean', 'clothes'],
    paint: ['wall', 'colour', 'color', 'decor', 'screeding'],
    carpent: ['wood', 'furniture', 'door', 'cabinet', 'bed', 'wardrobe', 'table'],
    tile: ['tiling', 'floor', 'screed', 'bathroom'],
    ceiling: ['pop', 'gypsum', 'design'],
    cctv: ['camera', 'security', 'alarm', 'gate', 'intercom'],
    tailor: ['sew', 'sewing', 'fashion', 'cloth', 'clothes', 'dress', 'aso ebi', 'alter'],
    photo: ['camera', 'video', 'event', 'wedding', 'shoot'],
    cater: ['food', 'cook', 'chef', 'event', 'party', 'cake', 'small chops'],
    tutor: ['teacher', 'lesson', 'school', 'exam', 'jamb', 'maths', 'english'],
    mov: ['relocation', 'packing', 'truck', 'transport', 'delivery']
  };
  var K_RECENT = 'll-recent-q', MAX = 6;
  var pool = [];   // { label, type, low, alias }

  function norm(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9\u00c0-\u024f ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function aliasesFor(low) {
    var out = [], pad = low + ' ';
    for (var k in SYN) if (pad.indexOf(k) >= 0) out = out.concat(SYN[k]);
    return out;
  }
  function add(list, type) {
    (list || []).forEach(function (x) {
      var label = String(x == null ? '' : x).trim(); if (!label || label.length > 60) return;
      var low = norm(label); if (!low) return;
      for (var i = 0; i < pool.length; i++) if (pool[i].low === low) { if (pool[i].type === 'Popular' && type) pool[i].type = type; return; }
      pool.push({ label: label, type: type || 'Popular', low: low, alias: aliasesFor(low) });
    });
  }
  add(POPULAR, 'Popular');

  function recents() { try { var a = JSON.parse(localStorage.getItem(K_RECENT) || '[]'); return Array.isArray(a) ? a.slice(0, MAX) : []; } catch (e) { return []; } }
  function remember(t) {
    t = String(t || '').trim(); if (t.length < 2) return;
    try { var a = recents().filter(function (x) { return norm(x) !== norm(t); }); a.unshift(t); localStorage.setItem(K_RECENT, JSON.stringify(a.slice(0, MAX))); } catch (e) {}
  }
  function clearRecents() { try { localStorage.removeItem(K_RECENT); } catch (e) {} }

  function score(it, q) {
    var l = it.low, words = l.split(' ');
    if (l === q) return 120;
    if (l.indexOf(q) === 0) return 100;
    for (var i = 0; i < words.length; i++) if (words[i].indexOf(q) === 0) return 80;
    if (l.indexOf(q) >= 0) return 50;
    for (var j = 0; j < it.alias.length; j++) { var a = it.alias[j]; if (a.indexOf(q) === 0 || q.indexOf(a) === 0 && a.length > 2) return 40; }
    for (var j2 = 0; j2 < it.alias.length; j2++) if (it.alias[j2].indexOf(q) >= 0 && q.length > 2) return 25;
    return 0;
  }
  function search(q) {
    q = norm(q); if (!q) return [];
    return pool.map(function (it) { return { it: it, s: score(it, q) }; }).filter(function (x) { return x.s > 0; })
      .sort(function (a, b) { return b.s - a.s || (a.it.type === 'Popular') - (b.it.type === 'Popular') || a.it.label.length - b.it.label.length || (a.it.label < b.it.label ? -1 : 1); })
      .slice(0, MAX).map(function (x) { return x.it; });
  }
  function mark(label, q) {
    var i = norm(label).indexOf(norm(q)), raw = String(label);
    if (!q || i < 0 || norm(label).length !== raw.toLowerCase().length) return esc(raw);
    var n = norm(q).length; return esc(raw.slice(0, i)) + '<b>' + esc(raw.slice(i, i + n)) + '</b>' + esc(raw.slice(i + n));
  }

  function css() {
    if (document.getElementById('ll-sg-css')) return;
    var s = document.createElement('style'); s.id = 'll-sg-css';
    s.textContent = '.ll-sg{position:fixed;z-index:9000;margin:0;padding:6px;list-style:none;background:var(--ll-surface,#fff);color:var(--ll-text,#18332A);border:1px solid var(--ll-border,#E1E8E3);border-radius:16px;box-shadow:0 18px 40px -12px rgba(10,35,81,.28);max-height:min(320px,48vh);overflow:auto;font:600 15px "Plus Jakarta Sans",system-ui,sans-serif;-webkit-tap-highlight-color:transparent}' +
      '.ll-sg[hidden]{display:none}.ll-sg li{display:flex;align-items:center;gap:10px;padding:11px 12px;border-radius:12px;cursor:pointer}' +
      '.ll-sg li[aria-selected="true"],.ll-sg li:hover{background:var(--ll-primary-soft,#E3F4EC)}.ll-sg b{color:var(--ll-primary,#07865F);font-weight:800}' +
      '.ll-sg svg{flex:none;width:18px;height:18px;color:var(--ll-text-2,#66756E)}.ll-sg .t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.ll-sg .k{flex:none;font-size:11px;font-weight:700;color:var(--ll-text-2,#66756E)}' +
      '.ll-sg .h{display:flex;justify-content:space-between;align-items:center;padding:6px 12px 2px;font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--ll-text-2,#66756E);cursor:default}' +
      '.ll-sg .h:hover{background:none}.ll-sg .h button{border:0;background:none;color:var(--ll-primary,#07865F);font:800 12px "Plus Jakarta Sans",system-ui,sans-serif;cursor:pointer;padding:2px 4px}';
    document.head.appendChild(s);
  }
  var ICON = { s: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
               r: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>' };
  var uid = 0;

  function attach(input, opts) {
    if (!input || input._llSg) return; input._llSg = true; opts = opts || {};
    css();
    var id = 'll-sg-' + (++uid), ul = document.createElement('ul'), items = [], active = -1, isOpen = false;
    ul.className = 'll-sg'; ul.id = id; ul.setAttribute('role', 'listbox'); ul.hidden = true; document.body.appendChild(ul);
    input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-expanded', 'false'); input.setAttribute('aria-controls', id); input.setAttribute('autocomplete', 'off');

    function place() {
      var box = (input.closest('form, .dc-search') || input).getBoundingClientRect();
      ul.style.left = Math.max(8, box.left) + 'px'; ul.style.width = Math.min(box.width, window.innerWidth - 16) + 'px'; ul.style.top = (box.bottom + 6) + 'px';
    }
    function close() { isOpen = false; ul.hidden = true; active = -1; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); }
    function setActive(n) {
      var lis = ul.querySelectorAll('li[role="option"]'); if (!lis.length) return;
      active = (n + lis.length) % lis.length;
      lis.forEach(function (li, i) { li.setAttribute('aria-selected', i === active ? 'true' : 'false'); });
      input.setAttribute('aria-activedescendant', lis[active].id); lis[active].scrollIntoView({ block: 'nearest' });
    }
    function pick(it) {
      input.value = it.label; remember(it.label); close();
      if (opts.onPick) opts.onPick(it); else input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    function render() {
      var q = input.value.trim(), head = '', list;
      if (!q) {
        var rec = recents(); if (rec.length) { head = 'Recent searches'; list = rec.map(function (t) { return { label: t, type: 'Recent' }; }); }
        else { head = 'Popular'; list = pool.filter(function (x) { return x.type !== 'Provider' && x.type !== 'Skill'; }).slice(0, 5); }
      } else list = search(q);
      items = list;
      if (!list.length) { ul.innerHTML = ''; close(); return; }
      var html = head ? '<li class="h" role="presentation"><span>' + head + '</span>' + (head === 'Recent searches' ? '<button type="button" data-clear>Clear</button>' : '') + '</li>' : '';
      html += list.map(function (it, i) { return '<li role="option" id="' + id + '-' + i + '" data-i="' + i + '" aria-selected="false">' + (it.type === 'Recent' ? ICON.r : ICON.s) + '<span class="t">' + mark(it.label, q) + '</span>' + (q && it.type !== 'Popular' ? '<span class="k">' + esc(it.type) + '</span>' : '') + '</li>'; }).join('');
      ul.innerHTML = html; active = -1; place(); ul.hidden = false; isOpen = true; input.setAttribute('aria-expanded', 'true');
    }
    ul.addEventListener('pointerdown', function (e) { e.preventDefault(); });   // keep focus in the box so a tap is not lost
    ul.addEventListener('click', function (e) {
      if (e.target.closest('[data-clear]')) { clearRecents(); render(); return; }
      var li = e.target.closest('li[data-i]'); if (li) pick(items[+li.getAttribute('data-i')]);
    });
    input.addEventListener('input', render);
    input.addEventListener('focus', render);
    input.addEventListener('blur', function () { setTimeout(close, 100); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { if (isOpen) { close(); e.preventDefault(); } return; }
      if (!isOpen) { if (e.key === 'ArrowDown') render(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
      else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(items[active]); }
    });
    if (input.form) input.form.addEventListener('submit', function () { remember(input.value); close(); });
    else input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && active < 0) remember(input.value); });
    window.addEventListener('resize', function () { if (isOpen) place(); });
    window.addEventListener('scroll', function () { if (isOpen) place(); }, true);
  }

  window.LLSuggest = { attach: attach, add: add, recents: recents, clearRecents: clearRecents, search: search };
})();
