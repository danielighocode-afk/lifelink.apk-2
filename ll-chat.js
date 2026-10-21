/* Shared messaging panel. LLChat.mount(el, conversationId, opts) -> { destroy() }. Polls every 8s (no realtime dependency). */
(function () {
  'use strict';
  window.LLChat = {
    mount: function (el, convId, opts) {
      opts = opts || {};
      var me = LL.me && LL.me.id, timer = null, lastKey = '', dead = false;
      el.innerHTML = '<div class="flex flex-col h-full min-h-[320px]"><div data-msgs class="flex-1 overflow-y-auto space-y-2 p-4 bg-slate-50 rounded-2xl border border-slate-200 max-h-[420px] min-h-[240px]"></div>' +
        '<form data-form class="mt-3 flex gap-2"><input data-input maxlength="2000" autocomplete="off" placeholder="Write a message" class="field flex-1" aria-label="Message">' +
        '<button class="shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm px-5 rounded-2xl">Send</button></form></div>';
      var box = el.querySelector('[data-msgs]'), form = el.querySelector('[data-form]'), input = el.querySelector('[data-input]');
      function draw(rows) {
        var key = rows.map(function (m) { return m.id + (m.read_at ? 'r' : ''); }).join(',');
        if (key === lastKey) return; lastKey = key;
        var atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
        box.innerHTML = rows.length ? rows.map(function (m) {
          var mine = m.sender_id === me;
          return '<div class="flex ' + (mine ? 'justify-end' : 'justify-start') + '"><div class="max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ' + (mine ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-200 text-slate-800') + '">' +
            '<p class="whitespace-pre-wrap break-words">' + LL.esc(m.body) + '</p><p class="text-[10px] mt-1 ' + (mine ? 'text-emerald-100' : 'text-slate-400') + '">' + LL.esc(LL.ago(m.created_at)) + '</p></div></div>';
        }).join('') : '<p class="text-center text-xs font-semibold text-slate-400 py-8">No messages yet. Say hello.</p>';
        if (atBottom || rows.length) box.scrollTop = box.scrollHeight;
      }
      function load() {
        if (dead) return;
        LLApi.messages.thread(convId).then(function (rows) {
          draw(rows);
          if (rows.some(function (m) { return m.sender_id !== me && !m.read_at; })) LLApi.messages.markRead(convId).catch(function () {});
        }, function (e) { box.innerHTML = LL.error(e.message); });
      }
      form.onsubmit = function (e) {
        e.preventDefault();
        var t = input.value.trim(); if (!t) return;
        input.disabled = true;
        LLApi.messages.send(convId, t).then(function () { input.value = ''; input.disabled = false; input.focus(); lastKey = ''; load(); if (opts.onSend) opts.onSend(); },
          function (err) { input.disabled = false; LL.toast(err.message, true); });
      };
      load(); timer = setInterval(load, 8000);
      return { destroy: function () { dead = true; clearInterval(timer); } };
    }
  };
})();
