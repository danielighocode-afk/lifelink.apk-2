/* Shared messaging panel. LLChat.mount(el, conversationId, opts) -> { destroy() }.
   Updates instantly through Supabase realtime (014_message_ticks.sql) and still checks every 8s as a fallback.
   Ticks on your own messages: one grey = sent, two grey = delivered, two purple = read. */
(function () {
  'use strict';

  /* ---- tick colours: deep purple in light mode, brighter violet in dark mode ---- */
  if (!document.getElementById('ll-tick-css')) {
    var st = document.createElement('style'); st.id = 'll-tick-css';
    st.textContent =
      '.ll-ticks{display:inline-flex;align-items:center;margin-left:6px;padding:1px 5px;border-radius:999px;background:#fff;vertical-align:middle;line-height:0}' +
      '.ll-ticks svg{width:15px;height:10px;display:block}' +
      '.ll-ticks .t{fill:none;stroke:#94A3B8;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}' +
      '.ll-ticks[data-s="read"] .t{stroke:#7C3AED}' +
      'html[data-theme="dark"] .ll-ticks{background:rgba(15,23,20,.78)}' +
      'html[data-theme="dark"] .ll-ticks .t{stroke:#CBD5E1}' +
      'html[data-theme="dark"] .ll-ticks[data-s="read"] .t{stroke:#A78BFA}';
    document.head.appendChild(st);
  }
  function tickSvg(status) {
    var one = '<path class="t" d="M1.5 5.5l3 3 5.5-7"/>';
    var two = '<path class="t" d="M1 5.5l3 3 5.5-7"/><path class="t" d="M6 7.8l1.2 1.2 5.8-7.5"/>';
    var label = status === 'read' ? 'Read' : status === 'delivered' ? 'Delivered' : 'Sent';
    return '<span class="ll-ticks" data-s="' + status + '" role="img" aria-label="' + label + '" title="' + label + '"><svg viewBox="0 0 14 10" aria-hidden="true">' + (status === 'sent' ? one : two) + '</svg></span>';
  }
  function statusOf(m) { return m.read_at ? 'read' : (m.delivered_at ? 'delivered' : 'sent'); }

  /* ---- global receiver: while the app is open, messages sent to me count as delivered (once per page) ---- */
  var receiverOn = false;
  function startReceiver() {
    if (receiverOn || !window.LLApi || !LLApi.messages || !LLApi.messages.subscribeMine) return;
    receiverOn = true;
    LLApi.messages.markAllDelivered();
    LLApi.messages.subscribeMine(function (m) {
      if (m && m.conversation_id && m.sender_id !== (LL.me && LL.me.id)) LLApi.messages.markDelivered(m.conversation_id);
    });
  }
  function boot() { if (window.LL && LL.ready) LL.ready(startReceiver); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  window.LLChat = {
    mount: function (el, convId, opts) {
      opts = opts || {};
      var me = LL.me && LL.me.id, timer = null, lastKey = '', dead = false, unsub = null, busy = false, again = false;
      el.innerHTML = '<div class="flex flex-col h-full min-h-[320px]"><div data-msgs class="flex-1 overflow-y-auto space-y-2 p-4 bg-slate-50 rounded-2xl border border-slate-200 max-h-[420px] min-h-[240px]"></div>' +
        '<form data-form class="mt-3 flex gap-2"><input data-input maxlength="2000" autocomplete="off" placeholder="Write a message" class="field flex-1" aria-label="Message">' +
        '<button class="shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm px-5 rounded-2xl">Send</button></form></div>';
      var box = el.querySelector('[data-msgs]'), form = el.querySelector('[data-form]'), input = el.querySelector('[data-input]');
      function draw(rows) {
        var key = rows.map(function (m) { return m.id + (m.read_at ? 'r' : m.delivered_at ? 'd' : ''); }).join(',');
        if (key === lastKey) return; lastKey = key;
        var atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
        box.innerHTML = rows.length ? rows.map(function (m) {
          var mine = m.sender_id === me;
          return '<div class="flex ' + (mine ? 'justify-end' : 'justify-start') + '"><div class="max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ' + (mine ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-200 text-slate-800') + '">' +
            '<p class="whitespace-pre-wrap break-words">' + LL.esc(m.body) + '</p><p class="text-[10px] mt-1 ' + (mine ? 'text-emerald-100' : 'text-slate-400') + '">' + LL.esc(LL.ago(m.created_at)) + (mine ? tickSvg(statusOf(m)) : '') + '</p></div></div>';
        }).join('') : '<p class="text-center text-xs font-semibold text-slate-400 py-8">No messages yet. Say hello.</p>';
        if (atBottom || rows.length) box.scrollTop = box.scrollHeight;
      }
      function load() {
        if (dead) return;
        if (busy) { again = true; return; }
        busy = true;
        LLApi.messages.thread(convId).then(function (rows) {
          busy = false;
          draw(rows);
          var incoming = rows.filter(function (m) { return m.sender_id !== me; });
          if (incoming.some(function (m) { return !m.read_at; })) LLApi.messages.markRead(convId).catch(function () {});
          else if (incoming.some(function (m) { return !m.delivered_at; })) LLApi.messages.markDelivered(convId);
          if (again) { again = false; load(); }
        }, function (e) { busy = false; box.innerHTML = LL.error(e.message); });
      }
      form.onsubmit = function (e) {
        e.preventDefault();
        var t = input.value.trim(); if (!t) return;
        input.disabled = true;
        LLApi.messages.send(convId, t).then(function () { input.value = ''; input.disabled = false; input.focus(); lastKey = ''; load(); if (opts.onSend) opts.onSend(); },
          function (err) { input.disabled = false; LL.toast(err.message, true); });
      };
      load(); timer = setInterval(load, 8000);
      if (LLApi.messages.subscribe) unsub = LLApi.messages.subscribe(convId, load);
      return { destroy: function () { dead = true; clearInterval(timer); if (unsub) unsub(); } };
    }
  };
})();
