/* LIFELINK data layer (window.LLApi).
   ---------------------------------------------------------------------------
   Every function talks to Supabase through the shared client in supabase-client.js.
   Row Level Security + the SQL functions in supabase/migrations/ enforce who may
   read or change what; nothing here is trusted for authorization.

   There is NO demo or fallback data in this file: on any failure the promise
   rejects with a readable Error and the page shows it.

   Money is integer kobo. The wallet is a prepaid platform-fee balance (not escrow);
   deposits go through Paystack Edge Functions. Maps/tracking are not part of this file yet.
*/
(function () {
  'use strict';

  function client() {
    if (!window.LLSB) return Promise.reject(new Error('supabase-client.js did not load.'));
    return window.LLSB.getClient();
  }
  function friendly(err) {
    var m = (err && (err.message || err.msg)) || String(err || 'Something went wrong.');
    m = m.replace(/^WALLET_(CUSTOMER|PROVIDER):\s*/, '');
    if (/one_quote_per_provider_per_request/.test(m)) return 'You have already sent a quote for this request.';
    if (/row-level security|permission denied/i.test(m)) return 'You do not have permission to do that.';
    if (/JWT|not authenticated|sign in required/i.test(m)) return 'Please sign in again.';
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Network problem. Check your connection and try again.';
    if (/relation .* does not exist|function .* does not exist|schema cache|Could not find the (table|function)/i.test(m)) {
      return 'The database is missing part of the LifeLink setup. Run the SQL files in supabase/migrations/ (up to 006_maps.sql) in the Supabase SQL Editor. (' + m + ')';
    }
    return m;
  }
  function fail(err) { throw new Error(friendly(err)); }
  // Resolve a PostgREST response to its data or throw a readable error.
  function data(p) { return Promise.resolve(p).then(function (r) { if (r && r.error) fail(r.error); return r ? r.data : null; }); }
  function uid() {
    if (!window.LLSB) return Promise.reject(new Error('supabase-client.js did not load.'));
    return window.LLSB.getSession().then(function (r) {
      if (!r.session) throw new Error('Please sign in.');
      return r.session.user.id;
    });
  }
  function q(table, build) { return client().then(function (c) { return data(build(c.from(table))); }); }
  function rpc(name, args) { return client().then(function (c) { return data(c.rpc(name, args || {})); }); }
  function uniq(a) { return a.filter(function (v, i) { return v && a.indexOf(v) === i; }); }

  var LIMITS = {
    'verification-docs': { max: 10485760, types: ['application/pdf', 'image/jpeg', 'image/png'] },
    'dispute-evidence': { max: 10485760, types: ['application/pdf', 'image/jpeg', 'image/png'] },
    'request-media': { max: 10485760, types: ['image/jpeg', 'image/png', 'image/webp'] },
    'avatars': { max: 2097152, types: ['image/jpeg', 'image/png', 'image/webp'] }
  };

  /* ------------------------------ storage ------------------------------ */
  function upload(bucket, file) {
    var lim = LIMITS[bucket];
    if (!file) return Promise.reject(new Error('No file selected.'));
    if (lim && file.size > lim.max) return Promise.reject(new Error(file.name + ' is larger than ' + Math.round(lim.max / 1048576) + ' MB.'));
    if (lim && lim.types.indexOf(file.type) < 0) return Promise.reject(new Error(file.name + ' is not an allowed file type.'));
    return uid().then(function (id) {
      var ext = (String(file.name).split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin';
      var name = id + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
      return client().then(function (c) {
        return c.storage.from(bucket).upload(name, file, { contentType: file.type, upsert: false });
      }).then(function (r) { if (r.error) fail(r.error); return name; });
    });
  }
  function signedUrl(bucket, path, secs) {
    return client().then(function (c) { return c.storage.from(bucket).createSignedUrl(path, secs || 300); })
      .then(function (r) { if (r.error) fail(r.error); return r.data.signedUrl; });
  }
  function publicUrl(bucket, path) {
    return client().then(function (c) { return c.storage.from(bucket).getPublicUrl(path).data.publicUrl; });
  }
  function uploadMany(bucket, files) {
    var list = Array.prototype.slice.call(files || []);
    return list.reduce(function (p, f) { return p.then(function (acc) { return upload(bucket, f).then(function (n) { acc.push(n); return acc; }); }); }, Promise.resolve([]));
  }

  /* --------------------------- public catalogue --------------------------- */
  var Catalog = {
    categories: function () { return q('service_categories', function (t) { return t.select('id,slug,name').eq('active', true).order('name'); }); },
    providers: function () { return q('public_providers', function (t) { return t.select('*').order('rating_avg', { ascending: false, nullsFirst: false }); }); },
    provider: function (id) { return q('public_providers', function (t) { return t.select('*').eq('provider_id', id).maybeSingle(); }); },
    services: function (providerId) {
      return q('provider_services', function (t) {
        var b = t.select('id,provider_id,category_id,title,description,base_price_kobo,active').eq('active', true);
        return providerId ? b.eq('provider_id', providerId).order('base_price_kobo') : b;
      });
    },
    // A provider's public catalogue (products + prices only appear for Business Owner accounts).
    items: function (providerId) {
      return q('public_catalog', function (t) { return t.select('id,provider_id,kind,title,description,price_kobo,image_url,created_at').eq('provider_id', providerId).order('created_at', { ascending: false }); });
    },
    reviews: function (providerId) {
      return q('public_reviews', function (t) {
        var b = t.select('provider_id,rating,comment,recommend,created_on').order('created_on', { ascending: false });
        return providerId ? b.eq('provider_id', providerId) : b;
      });
    }
  };

  /* ------------------------------- people ------------------------------- */
  // id -> { display_name, avatar_url } for people the caller legitimately deals with.
  function names() {
    return rpc('connected_profiles').then(function (rows) {
      var m = {}; (rows || []).forEach(function (r) { m[r.id] = r; }); return m;
    });
  }

  /* ------------------------------ customer ------------------------------ */
  var Customer = {
    createRequest: function (o) {
      return uid().then(function (id) {
        return uploadMany('request-media', o.files || []).then(function (paths) {
          var row = {
            customer_id: id,
            category_id: o.categoryId || null,
            category_text: o.categoryText || null,
            description: o.description,
            location_area: o.location,
            urgency: o.urgency || 'scheduled',
            media_paths: paths
          };
          if (o.directProviderId) row.direct_provider_id = o.directProviderId;
          if (o.preferredDate) row.preferred_date = o.preferredDate;
          if (o.preferredWindow) row.preferred_window = o.preferredWindow;
          return client().then(function (c) { return data(c.from('service_requests').insert(row).select('id').single()); }).then(function (created) {
            // Optional job pin: stored privately (not on the request row, which providers can browse).
            if (o.pin && created && created.id) {
              return rpc('set_request_pin', { p_request: created.id, p_lat: o.pin.lat, p_lng: o.pin.lng }).then(function () { return created; }, function () { created.pinFailed = true; return created; });
            }
            return created;
          });
        });
      });
    },
    requests: function () {
      return uid().then(function (id) {
        return q('service_requests', function (t) {
          return t.select('id,category_text,description,location_area,urgency,status,created_at,preferred_date,preferred_window,direct_provider_id,media_paths')
            .eq('customer_id', id).order('created_at', { ascending: false });
        });
      });
    },
    request: function (requestId) {
      return q('service_requests', function (t) {
        return t.select('id,customer_id,category_text,description,location_area,urgency,status,created_at,preferred_date,preferred_window,direct_provider_id,media_paths').eq('id', requestId).maybeSingle();
      });
    },
    quotes: function (requestId) {
      return q('quotes', function (t) {
        var b = t.select('id,request_id,provider_id,price_kobo,arrival_text,message,status,created_at');
        return (requestId ? b.eq('request_id', requestId) : b).order('created_at', { ascending: false });
      });
    },
    acceptQuote: function (quoteId) { return rpc('accept_quote', { p_quote_id: quoteId }); },
    cancelRequest: function (requestId) {
      return q('service_requests', function (t) { return t.update({ status: 'cancelled' }).eq('id', requestId).select('id'); });
    },
    bookings: function () {
      return q('bookings', function (t) {
        return t.select('id,request_id,quote_id,customer_id,provider_id,price_kobo,service_fee_kobo,status,fee_status,provider_arrived_at,customer_confirmed_arrival_at,fee_charged_at,scheduled_for,completed_at,reviewed,created_at').order('created_at', { ascending: false });
      });
    },
    booking: function (id) {
      return q('bookings', function (t) {
        return t.select('id,request_id,quote_id,customer_id,provider_id,price_kobo,service_fee_kobo,status,fee_status,provider_arrived_at,customer_confirmed_arrival_at,fee_charged_at,prev_status,scheduled_for,completed_at,reviewed,created_at').eq('id', id).maybeSingle();
      });
    },
    setSchedule: function (bookingId, iso) { return rpc('set_booking_schedule', { p_booking: bookingId, p_when: iso }); },
    cancelBooking: function (bookingId) { return rpc('cancel_booking', { p_booking: bookingId }); },
    submitReview: function (bookingId, rating, comment, recommend) {
      return rpc('submit_review', { p_booking: bookingId, p_rating: rating, p_comment: comment || null, p_recommend: recommend });
    },
    myReviews: function () {
      return uid().then(function (id) {
        return q('reviews', function (t) { return t.select('id,booking_id,provider_id,rating,comment,recommend,created_at').eq('reviewer_id', id).order('created_at', { ascending: false }); });
      });
    },
    reviewForBooking: function (bookingId) {
      return q('reviews', function (t) { return t.select('id,rating,comment,recommend,created_at').eq('booking_id', bookingId).maybeSingle(); });
    },
    openDispute: function (o) {
      return uploadMany('dispute-evidence', o.files || []).then(function (paths) {
        return rpc('open_dispute', { p_booking: o.bookingId, p_category: o.category, p_description: o.description, p_evidence: paths });
      });
    },
    disputes: function (bookingId) {
      return q('disputes', function (t) {
        var b = t.select('id,booking_id,reporter_id,category,description,status,evidence_paths,resolution_note,created_at,resolved_at');
        return (bookingId ? b.eq('booking_id', bookingId) : b).order('created_at', { ascending: false });
      });
    },
    confirmArrival: function (bookingId) { return rpc('confirm_arrival', { p_booking: bookingId }); }
  };

  /* ------------------------------ provider ------------------------------ */
  var Provider = {
    me: function () {
      return uid().then(function (id) {
        var base = 'profile_id,business_name,category,bio,service_area,verification_status,trust_score,rating_avg,jobs_done,available,years_experience,skills,created_at';
        // If migration 011 has not been run yet, fall back to the old columns so the dashboard still opens.
        return q('provider_profiles', function (t) { return t.select(base + ',provider_type,store_url').eq('profile_id', id).maybeSingle(); })
          .catch(function () { return q('provider_profiles', function (t) { return t.select(base).eq('profile_id', id).maybeSingle(); }); });
      });
    },
    apply: function (o) {
      return rpc('submit_provider_application', {
        p_business: o.business, p_category: o.category, p_bio: o.bio || null, p_area: o.area || null,
        p_years: o.years == null ? null : o.years, p_skills: o.skills || []
      });
    },
    addDocument: function (docType, file) {
      return upload('verification-docs', file).then(function (path) {
        return uid().then(function (id) {
          return client().then(function (c) { return data(c.from('provider_verifications').insert({ provider_id: id, doc_type: docType, file_path: path })); });
        });
      });
    },
    documents: function () {
      return uid().then(function (id) {
        return q('provider_verifications', function (t) { return t.select('id,doc_type,file_path,status,reviewer_note,created_at').eq('provider_id', id).order('created_at', { ascending: false }); });
      });
    },
    update: function (patch) {
      return uid().then(function (id) {
        return q('provider_profiles', function (t) { return t.update(patch).eq('profile_id', id).select('profile_id'); });
      });
    },
    services: function () {
      return uid().then(function (id) {
        return q('provider_services', function (t) { return t.select('id,category_id,title,description,base_price_kobo,active,created_at').eq('provider_id', id).order('created_at', { ascending: false }); });
      });
    },
    saveService: function (o) {
      return uid().then(function (id) {
        var row = { category_id: o.categoryId || null, title: o.title, description: o.description || null, base_price_kobo: o.priceKobo, active: o.active !== false };
        if (o.id) return q('provider_services', function (t) { return t.update(row).eq('id', o.id).select('id'); });
        row.provider_id = id;
        return q('provider_services', function (t) { return t.insert(row).select('id'); });
      });
    },
    deleteService: function (id) { return q('provider_services', function (t) { return t.delete().eq('id', id); }); },
    // Provider type: 'service_only' (A) or 'service_business' (B). Migration 011.
    setType: function (type, storeUrl) {
      var patch = { provider_type: type };
      if (storeUrl !== undefined) patch.store_url = type === 'service_business' ? (storeUrl || null) : null;
      return Provider.update(patch);
    },
    // Catalogue (max 10 items, one photo each). Products + prices only for type B (enforced in the database).
    catalog: function () {
      return uid().then(function (id) {
        return q('provider_catalog', function (t) { return t.select('id,kind,title,description,price_kobo,image_url,active,created_at').eq('provider_id', id).order('created_at', { ascending: false }); });
      });
    },
    saveCatalogItem: function (o) {
      return uid().then(function (id) {
        var row = { kind: o.kind, title: o.title, description: o.description || null, price_kobo: o.kind === 'product' ? o.priceKobo : null, active: o.active !== false };
        if (o.imageUrl) row.image_url = o.imageUrl;
        if (o.id) return q('provider_catalog', function (t) { return t.update(row).eq('id', o.id).select('id'); });
        row.provider_id = id;
        return q('provider_catalog', function (t) { return t.insert(row).select('id'); });
      });
    },
    deleteCatalogItem: function (id) { return q('provider_catalog', function (t) { return t.delete().eq('id', id); }); },
    uploadCatalogImage: function (file) {
      return upload('avatars', file).then(function (path) { return publicUrl('avatars', path); });
    },
    // Requests this provider may see (open board + ones they are linked to). RLS decides.
    requests: function () {
      return q('service_requests', function (t) {
        return t.select('id,customer_id,category_text,description,location_area,urgency,status,created_at,preferred_date,preferred_window,direct_provider_id,media_paths').order('created_at', { ascending: false });
      });
    },
    myQuotes: function () {
      return uid().then(function (id) {
        return q('quotes', function (t) { return t.select('id,request_id,price_kobo,arrival_text,message,status,created_at').eq('provider_id', id).order('created_at', { ascending: false }); });
      });
    },
    sendQuote: function (o) {
      return uid().then(function (id) {
        return q('quotes', function (t) {
          return t.insert({ request_id: o.requestId, provider_id: id, price_kobo: o.priceKobo, arrival_text: o.arrival || null, message: o.message || null }).select('id');
        });
      });
    },
    withdrawQuote: function (quoteId) { return q('quotes', function (t) { return t.update({ status: 'withdrawn' }).eq('id', quoteId).select('id'); }); },
    declineRequest: function (requestId) { return rpc('decline_request', { p_request_id: requestId }); },
    bookings: function () {
      return uid().then(function (id) {
        return q('bookings', function (t) {
          return t.select('id,request_id,customer_id,provider_id,price_kobo,service_fee_kobo,status,fee_status,provider_arrived_at,customer_confirmed_arrival_at,fee_charged_at,scheduled_for,completed_at,reviewed,created_at').eq('provider_id', id).order('created_at', { ascending: false });
        });
      });
    },
    requestsByIds: function (ids) {
      ids = uniq(ids); if (!ids.length) return Promise.resolve([]);
      return q('service_requests', function (t) { return t.select('id,category_text,description,location_area,urgency,status,created_at').in('id', ids); });
    },
    markOnTheWay: function (id) { return rpc('mark_on_the_way', { p_booking: id }); },
    arrived: function (id, manual) { return rpc('provider_arrived', { p_booking: id, p_manual: !!manual }); },
    cancelBooking: function (id) { return rpc('cancel_booking', { p_booking: id }); },
    startBooking: function (id) { return rpc('start_booking', { p_booking: id }); },
    completeBooking: function (id) { return rpc('complete_booking', { p_booking: id }); },
    reviews: function () {
      return uid().then(function (id) {
        return q('reviews', function (t) { return t.select('id,booking_id,rating,comment,recommend,created_at').eq('provider_id', id).order('created_at', { ascending: false }); });
      });
    }
  };

  /* ------------------------------ messaging ------------------------------ */
  var Messages = {
    open: function (requestId, providerId) { return rpc('open_conversation', { p_request: requestId, p_provider: providerId || null }); },
    // Chat about a catalogue product: ₦50 from each side the first time (reopening is free).
    openProduct: function (itemId) { return rpc('open_product_chat', { p_item: itemId }); },
    // Returns the customer's ₦50 for product chats the seller left unanswered for 24h. Safe to call often.
    sweepRefunds: function () { return rpc('refund_unanswered_chats', {}).catch(function () { return 0; }); },
    send: function (conversationId, body) { return rpc('send_message', { p_conversation: conversationId, p_body: body }); },
    markRead: function (conversationId) { return rpc('mark_conversation_read', { p_conversation: conversationId }); },
    conversations: function () {
      return q('conversations', function (t) { return t.select('id,request_id,customer_id,provider_id,created_at,last_message_at,item_title').order('last_message_at', { ascending: false, nullsFirst: false }); });
    },
    thread: function (conversationId) {
      return q('messages', function (t) { return t.select('id,conversation_id,sender_id,body,created_at,read_at').eq('conversation_id', conversationId).order('created_at'); });
    },
    // Latest message + unread count per conversation (for the inbox list).
    summaries: function (convs, myId) {
      if (!convs.length) return Promise.resolve({});
      var ids = convs.map(function (c) { return c.id; });
      return q('messages', function (t) { return t.select('id,conversation_id,sender_id,body,created_at,read_at').in('conversation_id', ids).order('created_at', { ascending: false }).limit(500); })
        .then(function (rows) {
          var out = {};
          rows.forEach(function (m) {
            var s = out[m.conversation_id] || (out[m.conversation_id] = { last: null, unread: 0 });
            if (!s.last) s.last = m;
            if (m.sender_id !== myId && !m.read_at) s.unread++;
          });
          return out;
        });
    },
    unreadTotal: function (myId) {
      return client().then(function (c) {
        return c.from('messages').select('id', { count: 'exact', head: true }).neq('sender_id', myId).is('read_at', null);
      }).then(function (r) { if (r.error) fail(r.error); return r.count || 0; });
    }
  };

  /* ---------------------------- notifications ---------------------------- */
  var Notifications = {
    list: function (n) { return q('notifications', function (t) { return t.select('id,type,title,body,link,read_at,created_at').order('created_at', { ascending: false }).limit(n || 20); }); },
    unreadCount: function () {
      return uid().then(function (id) {
        return client().then(function (c) { return c.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', id).is('read_at', null); });
      }).then(function (r) { if (r.error) fail(r.error); return r.count || 0; });
    },
    markRead: function (id) { return q('notifications', function (t) { return t.update({ read_at: new Date().toISOString() }).eq('id', id); }); },
    // Realtime: calls cb(row) for each new notification for this user (needs 007_notifications_realtime.sql; the page also polls). Returns unsubscribe.
    subscribe: function (cb) {
      var ch = null, dead = false;
      uid().then(function (id) { return client().then(function (c) {
        if (dead || !c.channel) return;
        ch = c.channel('notif-' + id).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + id }, function (p) { if (p && p.new) cb(p.new); }).subscribe();
      }); }).catch(function () {});
      return function () { dead = true; if (ch) { client().then(function (c) { c.removeChannel(ch); }).catch(function () {}); } };
    },
    markAllRead: function () {
      return uid().then(function (id) {
        return q('notifications', function (t) { return t.update({ read_at: new Date().toISOString() }).eq('user_id', id).is('read_at', null); });
      });
    }
  };

  /* -------------------------------- admin -------------------------------- */
  var Admin = {
    overview: function () { return rpc('admin_overview'); },
    applications: function () {
      return Promise.all([
        q('provider_profiles', function (t) { return t.select('profile_id,business_name,category,bio,service_area,verification_status,years_experience,skills,rating_avg,jobs_done,created_at').order('created_at', { ascending: false }); }),
        q('profiles', function (t) { return t.select('id,full_name,email,phone,role,created_at'); }),
        q('provider_verifications', function (t) { return t.select('id,provider_id,doc_type,file_path,status,reviewer_note,created_at').order('created_at', { ascending: false }); })
      ]).then(function (r) {
        var people = {}; r[1].forEach(function (p) { people[p.id] = p; });
        return r[0].map(function (pp) {
          return { profile: people[pp.profile_id] || {}, provider: pp, documents: r[2].filter(function (d) { return d.provider_id === pp.profile_id; }) };
        });
      });
    },
    setVerification: function (providerId, status, note) { return rpc('set_verification', { p_provider: providerId, p_status: status, p_note: note || null }); },
    users: function () { return q('profiles', function (t) { return t.select('id,full_name,email,phone,role,created_at').order('created_at', { ascending: false }); }); },
    categories: function () { return q('service_categories', function (t) { return t.select('id,slug,name,active,created_at').order('name'); }); },
    setCategory: function (o) { return rpc('set_category', { p_id: o.id || null, p_slug: o.slug, p_name: o.name, p_active: o.active !== false }); },
    requests: function () { return q('service_requests', function (t) { return t.select('id,customer_id,category_text,description,location_area,urgency,status,created_at').order('created_at', { ascending: false }).limit(200); }); },
    bookings: function () { return q('bookings', function (t) { return t.select('id,request_id,customer_id,provider_id,price_kobo,service_fee_kobo,status,fee_status,provider_arrived_at,customer_confirmed_arrival_at,fee_charged_at,scheduled_for,completed_at,created_at').order('created_at', { ascending: false }).limit(200); }); },
    disputes: function () {
      return q('disputes', function (t) { return t.select('id,booking_id,reporter_id,category,description,status,evidence_paths,resolution_note,created_at,resolved_at').order('created_at', { ascending: false }); });
    },
    resolveDispute: function (id, status, note) { return rpc('admin_resolve_dispute', { p_dispute: id, p_status: status, p_note: note || null }); },
    reviews: function () { return q('reviews', function (t) { return t.select('id,booking_id,reviewer_id,provider_id,rating,comment,recommend,created_at').order('created_at', { ascending: false }).limit(200); }); },
    reports: function () {
      return Promise.all([q('reports', function (t) { return t.select('id,reporter_id,kind,category,reference,description,status,admin_note,created_at').order('created_at', { ascending: false }).limit(200); }), names().catch(function () { return {}; })]).then(function (r) {
        return r[0].map(function (x) { x.reporter_name = (r[1][x.reporter_id] || {}).display_name || ''; return x; });
      });
    },
    setReportStatus: function (id, status, note) { return rpc('admin_set_report_status', { p_report: id, p_status: status, p_note: note || null }); },
    cancelBooking: function (id, note) { return rpc('admin_cancel_booking', { p_booking: id, p_note: note || null }); },
    penalties: function () { return q('arrival_penalty_log', function (t) { return t.select('id,booking_id,party,user_id,reason,amount_kobo,status,created_at').order('created_at', { ascending: false }).limit(200); }); },
    deposits: function () { return q('wallet_deposits', function (t) { return t.select('id,user_id,reference,amount_kobo,status,gateway_response,credited_at,created_at').order('created_at', { ascending: false }).limit(200); }); }
  };


  /* ------------------------------ tracking ------------------------------ */
  var Tracking = {
    // Booking + job pin + the latest shared points. Readable only by the two parties (and admins) via RLS.
    snapshot: function (bookingId) {
      return client().then(function (c) {
        return data(c.from('bookings').select('id,request_id,customer_id,provider_id,status,fee_status,arrival_method,provider_arrived_at,approaching_notified_at').eq('id', bookingId).maybeSingle()).then(function (b) {
          if (!b) return null;
          return Promise.all([
            data(c.from('request_locations').select('lat,lng').eq('request_id', b.request_id).maybeSingle()).catch(function () { return null; }),
            data(c.from('booking_locations').select('user_id,lat,lng,accuracy_m,updated_at').eq('booking_id', bookingId)).catch(function () { return []; })
          ]).then(function (r) { return { booking: b, pin: r[0], points: r[1] || [] }; });
        });
      });
    },
    pushLocation: function (bookingId, lat, lng, accuracy, capturedIso) {
      return rpc('update_my_location', { p_booking: bookingId, p_lat: lat, p_lng: lng, p_accuracy: accuracy == null ? null : accuracy, p_captured_at: capturedIso || new Date().toISOString() });
    },
    // Realtime: calls cb when either party's point changes. Returns an unsubscribe function. Falls back silently (page polls anyway).
    subscribe: function (bookingId, cb) {
      var ch = null, dead = false;
      client().then(function (c) {
        if (dead || !c.channel) return;
        ch = c.channel('bloc-' + bookingId).on('postgres_changes', { event: '*', schema: 'public', table: 'booking_locations', filter: 'booking_id=eq.' + bookingId }, function () { cb(); }).subscribe();
      }).catch(function () {});
      return function () { dead = true; if (ch) { client().then(function (c) { c.removeChannel(ch); }).catch(function () {}); } };
    }
  };

  /* ------------------------------- wallet ------------------------------- */
  // Reads come straight from RLS-protected tables / my_wallet(); deposits go through the Paystack Edge Functions.
  function callFn(name, body) {
    return client().then(function (c) { return c.functions.invoke(name, { body: body }); }).then(function (r) {
      if (!r.error) return r.data;
      var ctx = r.error.context;
      if (ctx && typeof ctx.json === 'function') {
        return ctx.json().then(function (j) { throw new Error((j && j.error) || 'Request failed.'); }, function () { throw new Error('Request failed.'); });
      }
      if (/not found|404|Failed to send/i.test(r.error.message || '')) throw new Error('Payments are not set up yet. The Paystack functions have not been deployed.');
      throw new Error(friendly(r.error));
    });
  }
  var Wallet = {
    me: function () { return rpc('my_wallet'); },
    ledger: function (limit) {
      return q('wallet_ledger', function (t) { return t.select('id,kind,available_delta,held_delta,available_after,held_after,booking_id,note,created_at').order('created_at', { ascending: false }).limit(limit || 50); });
    },
    deposits: function (limit) {
      return q('wallet_deposits', function (t) { return t.select('id,reference,amount_kobo,status,credited_at,created_at').order('created_at', { ascending: false }).limit(limit || 20); });
    },
    startDeposit: function (amountKobo) { return callFn('smart-service', { amount_kobo: amountKobo }); },
    verifyDeposit: function (reference) { return callFn('paystack-verify', { reference: reference }); }
  };
  window.LLApi = {
    friendly: friendly,
    uid: uid,
    upload: upload,
    signedUrl: signedUrl,
    publicUrl: publicUrl,
    names: names,
    catalog: Catalog,
    customer: Customer,
    provider: Provider,
    messages: Messages,
    notifications: Notifications,
    admin: Admin,
    wallet: Wallet,
    tracking: Tracking,
    uniq: uniq,
    reports: {
      submit: function (o) {
        return uid().then(function (id) {
          return q('reports', function (t) { return t.insert({ reporter_id: id, kind: o.kind, category: o.category, reference: o.reference || null, description: o.description }).select('id'); });
        });
      },
      mine: function () { return q('reports', function (t) { return t.select('id,kind,category,reference,status,created_at').order('created_at', { ascending: false }); }); }
    },
    deleteAccount: function () { return rpc('delete_my_account'); },
    // Banner upload -> same public bucket (own folder), then save the URL on the caller's profile (migration 009).
    uploadBanner: function (file) {
      return upload('avatars', file).then(function (path) {
        return publicUrl('avatars', path).then(function (url) {
          return window.LLAuth.updateProfile({ banner_url: url }).then(function (r) { if (r.error) throw r.error; return url; });
        });
      });
    },
    // Avatar upload -> public bucket, then save the URL on the caller's profile.
    uploadAvatar: function (file) {
      return upload('avatars', file).then(function (path) {
        return publicUrl('avatars', path).then(function (url) {
          return window.LLAuth.updateProfile({ avatar_url: url }).then(function (r) { if (r.error) throw r.error; return url; });
        });
      });
    }
  };
})();
