// Shared funnel runtime: attribution capture, pixels, API calls, small UI helpers.
(function () {
  const C = window.KD_FUNNEL || {};
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    sget(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch { return null; } },
    sset(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} }
  };

  // ---- attribution (first touch kept, last touch refreshed) ----
  const qs = new URLSearchParams(location.search);
  const keys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "gclid", "wbraid", "gbraid", "li_fat_id", "ad_id", "creative"];
  const touch = {};
  keys.forEach(k => { if (qs.get(k)) touch[k] = qs.get(k).slice(0, 300); });
  if (Object.keys(touch).length) {
    touch.ts = Date.now();
    touch.landing = location.pathname;
    touch.referrer = document.referrer ? document.referrer.slice(0, 300) : "";
    if (!store.get("kd_attr_first")) store.set("kd_attr_first", touch);
    store.set("kd_attr_last", touch);
  }
  function cookie(name) {
    const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : "";
  }
  function attribution() {
    const last = store.get("kd_attr_last") || {};
    const first = store.get("kd_attr_first") || {};
    let fbc = cookie("_fbc");
    if (!fbc && (last.fbclid || first.fbclid)) fbc = "fb.1." + (last.ts || Date.now()) + "." + (last.fbclid || first.fbclid);
    return {
      first, last,
      fbp: cookie("_fbp"), fbc,
      li_fat_id: last.li_fat_id || first.li_fat_id || cookie("li_fat_id") || "",
      gclid: last.gclid || first.gclid || "",
      ga_client_id: (cookie("_ga").split(".").slice(-2).join(".")) || "",
      page: location.href.split("#")[0].slice(0, 500),
      tz: (Intl.DateTimeFormat().resolvedOptions().timeZone || ""),
      ua: navigator.userAgent.slice(0, 300)
    };
  }

  // ---- pixels (optional) ----
  function loadPixels() {
    if (C.metaPixelId && !window.fbq) {
      !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); }(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
      window.fbq("init", C.metaPixelId); window.fbq("track", "PageView");
    }
    if (C.linkedinPartnerId && !window.lintrk) {
      window._linkedin_partner_id = C.linkedinPartnerId;
      window._linkedin_data_partner_ids = [C.linkedinPartnerId];
      (function (l) { if (!l) { window.lintrk = function (a, b) { window.lintrk.q.push([a, b]); }; window.lintrk.q = []; } const s = document.getElementsByTagName("script")[0]; const b = document.createElement("script"); b.type = "text/javascript"; b.async = true; b.src = "https://snap.licdn.com/li.lms-analytics/insight.min.js"; s.parentNode.insertBefore(b, s); })(window.lintrk);
    }
    if (C.ga4MeasurementId && !window.gtag) {
      const s = document.createElement("script"); s.async = true; s.src = "https://www.googletagmanager.com/gtag/js?id=" + C.ga4MeasurementId; document.head.appendChild(s);
      window.dataLayer = window.dataLayer || []; window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag("js", new Date()); window.gtag("config", C.ga4MeasurementId);
    }
  }

  // Browser-side event; server sends the same event_id so platforms de-duplicate.
  function track(name, params, eventId) {
    params = params || {};
    try { if (window.fbq) window.fbq(name.startsWith("kd_") ? "trackCustom" : "track", name, params, eventId ? { eventID: eventId } : undefined); } catch {}
    // GA4 can't de-duplicate against server events, so conversions (Lead, Schedule…) are server-only there.
    try { if (window.gtag && name.startsWith("kd_")) window.gtag("event", name, params); } catch {}
  }

  async function api(path, body, opts) {
    opts = opts || {};
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), opts.timeout || 12000);
    try {
      const res = await fetch(C.apiBase + path, {
        method: body ? "POST" : "GET",
        headers: Object.assign({ "content-type": "application/json" }, opts.headers || {}),
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
        keepalive: !!opts.keepalive
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(data.error || ("HTTP " + res.status)), { status: res.status, data });
      return data;
    } finally { clearTimeout(t); }
  }

  function videoInto(el, url, label) {
    if (!el) return;
    if (!url) {
      el.innerHTML = '<div class="placeholder"><div><div class="play" aria-hidden="true"></div><div class="mono small">' + (label || "Video coming soon") + "</div></div></div>";
      return;
    }
    if (/\.mp4(\?|$)/i.test(url)) {
      el.innerHTML = '<video controls playsinline preload="metadata" src="' + url + '"></video>';
    } else {
      el.innerHTML = '<iframe src="' + url + '" title="' + (label || "Video") + '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe>';
    }
  }

  function stickyCta() {
    const bar = document.querySelector(".sticky-cta");
    const hero = document.querySelector("[data-hero-cta]");
    if (!bar || !hero || !("IntersectionObserver" in window)) return;
    document.body.classList.add("has-sticky");
    new IntersectionObserver(([e]) => bar.classList.toggle("show", !e.isIntersecting && e.boundingClientRect.top < 0)).observe(hero);
  }

  function carryParams(a) {
    // Keep UTMs/click ids on internal links so attribution survives page hops.
    const keep = new URLSearchParams();
    keys.forEach(k => { if (qs.get(k)) keep.set(k, qs.get(k)); });
    const s = keep.toString();
    if (!s) return;
    document.querySelectorAll("a[data-carry]").forEach(link => {
      const u = new URL(link.getAttribute("href"), location.href);
      keep.forEach((v, k) => u.searchParams.set(k, v));
      link.setAttribute("href", u.pathname + u.search + u.hash);
    });
  }

  function footerYear() { document.querySelectorAll("[data-year]").forEach(n => n.textContent = new Date().getFullYear()); }

  function normPhone(v) {
    v = (v || "").trim();
    if (!v) return "";
    let d = v.replace(/[^\d+]/g, "");
    if (!d.startsWith("+")) { d = d.replace(/\D/g, ""); if (d.length === 10) d = "+1" + d; else if (d.length === 11 && d.startsWith("1")) d = "+" + d; else d = "+" + d; }
    return d;
  }

  // An application that failed to send (network/API down) is retried from any funnel page,
  // with the same event id, so the Worker treats a duplicate as the same submission.
  async function retryUnsent() {
    const u = store.get("kd_unsent_lead");
    if (!u) return;
    if (Date.now() - u.ts > 7 * 864e5) { try { localStorage.removeItem("kd_unsent_lead"); } catch {} return; }
    try { await api("/api/lead", Object.assign({ retry: true }, u)); localStorage.removeItem("kd_unsent_lead"); } catch {}
  }

  // What each stated need gets shown on the call. Used by the booking and thank-you pages
  // so every lead sees their own problem reflected back, in the order they ranked it.
  const NEEDS = {
    citations: "See each answer traced to the exact passage, file and version",
    cost: "See cost per answer on your files against what you run today",
    sovereignty: "See it run in your jurisdiction or on your own hardware",
    media: "See search land on the exact timestamp in your recordings and video",
    agent_memory: "See one shared memory your agents and staff all read from",
    consolidate: "See one service replace your vector database, file store and chunking pipeline"
  };
  function callShows(needs, max) {
    const list = (needs || []).filter(n => NEEDS[n]).map(n => NEEDS[n]);
    if (!list.length) list.push(NEEDS.citations, NEEDS.cost);
    return list.slice(0, max || 3).concat([OUTCOME]);
  }
  const OUTCOME = "Leave knowing whether a design-partner build fits, and what it costs (enterprise from $5,120/month)";

  window.KD = { C, store, NEEDS, callShows, attribution, track, api, videoInto, normPhone, uid: () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)) };

  loadPixels();
  document.addEventListener("DOMContentLoaded", () => { stickyCta(); carryParams(); footerYear(); setTimeout(retryUnsent, 1500); });
})();
