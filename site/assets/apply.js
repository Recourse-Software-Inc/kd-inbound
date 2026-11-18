// Application form: one question per screen, conditional branching, keyboard support,
// server-side scoring with a client-side fallback so a qualified lead is never stranded.
(function () {
  const C = KD.C;
  const form = document.getElementById("app");
  const steps = Array.from(form.querySelectorAll(".q"));
  const byId = Object.fromEntries(steps.map(s => [s.dataset.q, s]));
  const bar = document.getElementById("bar");
  const note = document.getElementById("stepNote");
  const nextBtn = document.getElementById("next");
  const backBtn = document.getElementById("back");
  const errBox = document.getElementById("formError");
  const SAVE = "kd_apply_draft";

  document.querySelectorAll("[data-floor]").forEach(n => n.textContent = "$" + Number(C.enterpriseFloorMonthly).toLocaleString("en-US"));
  document.querySelectorAll("[data-privacy]").forEach(a => a.href = C.privacyUrl);

  // ---------- state ----------
  function answers() {
    const fd = new FormData(form);
    const multi = n => fd.getAll(n);
    return {
      role: fd.get("role") || "",
      building: fd.get("building") || "",
      stack: multi("stack"),
      volume: fd.get("volume") || "",
      needs: multi("needs"),
      timeline: fd.get("timeline") || "",
      budget: fd.get("budget") || "",
      usecase: (fd.get("usecase") || "").trim()
    };
  }
  function contact() {
    return {
      name: form.name.value.trim(),
      company: companyFromEmail(form.email.value), // derived from the work-email domain; one less field
      email: form.email.value.trim().toLowerCase(),
      phone: KD.normPhone(form.phone.value),
      smsConsent: form.smsConsent.checked,
      website: form.website.value // honeypot
    };
  }

  function companyFromEmail(e) {
    const d = String(e || "").split("@")[1] || "";
    const base = d.split(".").slice(-2, -1)[0] || "";
    return base ? base.charAt(0).toUpperCase() + base.slice(1) : "";
  }

  // Order + branching. Personal projects skip the qualification questions.
  function path() {
    const a = answers();
    if (a.building === "personal") return ["role", "building", "usecase", "contact"];
    return ["role", "building", "stack", "volume", "needs", "timeline", "budget", "usecase", "contact"];
  }

  let current = "role";
  function show(id, dir) {
    current = id;
    steps.forEach(s => s.classList.toggle("active", s.dataset.q === id));
    const p = path(); const i = p.indexOf(id);
    bar.style.width = Math.round((i / p.length) * 100) + "%";
    note.textContent = "Step " + (i + 1) + " of " + p.length;
    backBtn.style.display = i === 0 ? "none" : "";
    const last = i === p.length - 1;
    nextBtn.innerHTML = last ? finalLabel() : 'Continue <span class="arrow" aria-hidden="true">→</span>';
    adaptCopy();
    errBox.style.display = "none";
    const step = byId[id];
    // focus: first checked/first input for keyboard and screen-reader users
    const focusEl = step.querySelector("input:checked") || step.querySelector("textarea, input:not([type=hidden]):not([name=website])");
    if (focusEl && dir !== "init") setTimeout(() => focusEl.focus({ preventScroll: true }), 30);
    window.scrollTo({ top: 0, behavior: dir === "init" ? "auto" : "smooth" });
    save();
    KD.track("kd_apply_step", { step: id, index: i + 1 });
  }

  // The last button says what happens next, based on the same rules the server applies.
  function finalLabel() {
    const l = localScore(answers(), contact());
    return (l.route === "qualified" ? "Pick a time" : "Send me the free plan") + ' <span class="arrow" aria-hidden="true">→</span>';
  }
  function refreshFinal() { if (current === path()[path().length - 1]) { nextBtn.innerHTML = finalLabel(); adaptCopy(); } }

  function adaptCopy() {
    const a = answers();
    const t = document.getElementById("ucTitle");
    if (a.building === "customer_product") t.textContent = "What should knowdrive do inside your product?";
    else if (a.building === "internal") t.textContent = "Which processes or teams should knowdrive support?";
    else t.textContent = "What should knowdrive do for you?";
    const likelyDQ = localScore(a, contact()).route !== "qualified"; // same rule as the final button
    document.getElementById("contactHint").textContent = likelyDQ
      ? "We'll send you the free plan and the resources that match what you told us."
      : "If it's a fit, the next screen opens Joel's calendar: 60 minutes, live demo on your files. If not, we email you the free plan.";
  }

  function valid(id, report) {
    const step = byId[id]; const type = step.dataset.type;
    if (type === "single") return !!step.querySelector("input:checked") || (report && flash("Pick one option to continue."));
    if (type === "multi") return !!step.querySelector("input:checked") || (report && flash("Pick at least one option."));
    if (type === "text") {
      const ok = answers().usecase.length >= 20;
      step.querySelector(".field").classList.toggle("invalid", !ok && report);
      return ok;
    }
    if (type === "contact") {
      const c = contact(); let ok = true;
      const set = (el, bad) => { el.closest(".field").classList.toggle("invalid", bad && report); if (bad) ok = false; };
      set(form.name, c.name.length < 2);
      set(form.email, !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.email));
      set(form.phone, !!c.phone && !/^\+\d{8,15}$/.test(c.phone));
      if (report && form.smsConsent.checked && !c.phone) { set(form.phone, true); form.phone.closest(".field").querySelector(".err").textContent = "Add a mobile number for texts, or untick the box."; }
      if (!ok && report) { const bad = step.querySelector(".invalid input"); if (bad) bad.focus(); }
      return ok;
    }
    return true;
  }
  function flash(msg) { errBox.textContent = msg; errBox.style.display = "block"; return false; }

  function next() {
    if (!valid(current, true)) return;
    const p = path(); const i = p.indexOf(current);
    if (i === p.length - 1) return submit();
    show(p[i + 1], "fwd");
  }
  function back() {
    const p = path(); const i = p.indexOf(current);
    if (i > 0) show(p[i - 1], "back");
  }
  nextBtn.addEventListener("click", next);
  backBtn.addEventListener("click", back);

  // Auto-advance on single choice; "Nothing yet" is exclusive in the stack question.
  form.addEventListener("change", e => {
    const t = e.target;
    if (t.name === "stack") {
      const boxes = form.querySelectorAll("input[name=stack]");
      if (t.value === "none" && t.checked) boxes.forEach(b => { if (b.value !== "none") b.checked = false; });
      else if (t.checked) form.querySelector("input[name=stack][value=none]").checked = false;
    }
    errBox.style.display = "none";
    save();
    // Auto-advance only for pointer/number-key picks; arrow keys move between options without advancing.
    if (t.type === "radio" && pickedByPointer) setTimeout(() => { if (byId[current].contains(t)) next(); }, 260);
    pickedByPointer = false;
  });
  let pickedByPointer = false;
  form.addEventListener("pointerdown", e => { if (e.target.closest(".opt")) pickedByPointer = true; });
  form.addEventListener("input", e => {
    const f = e.target.closest(".field"); if (f) f.classList.remove("invalid");
    if (e.target === form.phone) { const has = form.phone.value.trim().length > 0; document.getElementById("smsConsentRow").hidden = !has; if (!has) form.smsConsent.checked = false; }
    if (e.target === form.email) refreshFinal();
  });

  // Keyboard: number keys pick options; Enter continues (Shift+Enter = newline in textarea).
  document.addEventListener("keydown", e => {
    if (document.getElementById("checking").classList.contains("active")) return;
    const step = byId[current];
    const inText = /^(TEXTAREA|INPUT)$/.test(e.target.tagName) && !/radio|checkbox/.test(e.target.type);
    if (e.key === "Enter" && !(e.target.tagName === "TEXTAREA" && e.shiftKey)) {
      if (e.target.tagName === "A" || e.target.tagName === "BUTTON") return;
      e.preventDefault(); next(); return;
    }
    if (!inText && /^[1-9]$/.test(e.key) && (step.dataset.type === "single" || step.dataset.type === "multi")) {
      const inputs = step.querySelectorAll("input");
      const el = inputs[Number(e.key) - 1];
      if (el) { el.checked = el.type === "checkbox" ? !el.checked : true; pickedByPointer = el.type === "radio"; el.dispatchEvent(new Event("change", { bubbles: true })); }
    }
  });

  // ---------- draft persistence ----------
  function save() {
    const a = answers(); const c = contact(); delete c.website;
    KD.store.sset(SAVE, { a, c, current });
  }
  function restore() {
    const d = KD.store.sget(SAVE); if (!d) return;
    const setVal = (n, v) => { const els = form.querySelectorAll("[name=" + n + "]"); els.forEach(el => { if (el.type === "radio" || el.type === "checkbox") el.checked = Array.isArray(v) ? v.includes(el.value) : el.value === v; else el.value = v || ""; }); };
    Object.entries(d.a || {}).forEach(([k, v]) => setVal(k, v));
    ["name", "email", "phone"].forEach(k => { if (d.c && d.c[k]) form[k].value = d.c[k]; });
    if (d.c && d.c.phone) document.getElementById("smsConsentRow").hidden = false;
    if (d.c && d.c.smsConsent) form.smsConsent.checked = true;
    if (d.current && byId[d.current] && path().includes(d.current)) current = d.current;
  }

  // ---------- scoring fallback (mirror of worker/src/score.js; server is authoritative) ----------
  const FREE = /@(gmail|googlemail|yahoo|hotmail|outlook|live|icloud|me|aol|proton|protonmail|gmx|mail|yandex)\./i;
  function localScore(a, c) {
    if (a.building === "personal" || a.budget === "no") return { route: "dq", score: 0 };
    if (a.building === "prototype" && a.timeline === "research") return { route: "dq", score: 0 };
    let s = 0;
    s += { ai_lead: 2, cto: 2, platform: 2, founder: 2, ic: 1, other: 0 }[a.role] || 0;
    s += { customer_product: 3, internal: 2, prototype: 0 }[a.building] || 0;
    s += { lt10: 0, "10_250": 1, "250_5000": 2, gt5000: 2, unsure: 0 }[a.volume] || 0;
    s += { month: 2, quarter: 2, half: 1, research: 0 }[a.timeline] || 0;
    s += { approved: 3, if_proven: 2, build_case: 1 }[a.budget] || 0;
    if (a.needs.length >= 2) s += 1;
    if (a.needs.includes("sovereignty")) s += 1;
    if (a.stack.some(x => x !== "none")) s += 1;
    s += FREE.test(c.email) ? -2 : 1;
    return { route: s >= 7 ? "qualified" : "dq", score: s };
  }

  // ---------- submit ----------
  let sending = false;
  async function submit() {
    if (sending) return; sending = true;
    const a = answers(); const c = contact();
    const eventId = KD.uid();
    const checking = document.getElementById("checking");
    form.style.display = "none"; checking.classList.add("active");
    bar.style.width = "100%"; note.textContent = "";
    const items = checking.querySelectorAll(".checklist li");
    items.forEach((li, i) => setTimeout(() => li.classList.add("done"), 600 + i * 350));
    const minWait = new Promise(r => setTimeout(r, 1200));

    let result;
    try {
      result = await KD.api("/api/lead", { answers: a, contact: c, attribution: KD.attribution(), eventId, turnstile: window.__kdTurnstile || "" }, { timeout: 15000 });
    } catch (err) {
      if (err.status === 400 && err.data && err.data.field) {
        // server rejected a field: go back to the contact step and show it
        await minWait;
        checking.classList.remove("active"); form.style.display = ""; sending = false;
        show("contact", "back");
        const el = form[err.data.field]; if (el) { el.closest(".field").classList.add("invalid"); el.focus(); }
        return flash(err.data.error || "We couldn't accept one of your details. Check the highlighted field.");
      }
      // network/server trouble: route on the local score so nobody is stranded
      const l = localScore(a, c);
      result = { route: l.route, leadId: "", token: "", offline: true };
      KD.store.set("kd_unsent_lead", { answers: a, contact: c, attribution: KD.attribution(), eventId, ts: Date.now() });
    }
    await minWait;

    KD.store.sset("kd_lead", {
      id: result.leadId, token: result.token, watch: result.watch || "", route: result.route,
      name: c.name, email: c.email, phone: c.phone, smsConsent: !!c.smsConsent, company: c.company,
      building: a.building, needs: a.needs, usecase: a.usecase, offline: !!result.offline
    });
    try { sessionStorage.removeItem(SAVE); } catch {}

    if (result.route === "qualified") {
      KD.track("Lead", { content_name: "qualified" }, eventId);
      location.href = "../book/" + location.search;
    } else {
      KD.track("kd_lead_dq", {}, eventId);
      location.href = "../resources/" + location.search;
    }
  }

  // Optional Cloudflare Turnstile (invisible unless challenged) when a site key is configured.
  if (C.turnstileSiteKey) {
    const box = document.createElement("div"); box.style.marginTop = "12px";
    byId.contact.appendChild(box);
    window.__kdTurnstileLoad = () => window.turnstile.render(box, { sitekey: C.turnstileSiteKey, theme: "dark", callback: t => { window.__kdTurnstile = t; } });
    const s = document.createElement("script"); s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=__kdTurnstileLoad"; s.async = true; document.head.appendChild(s);
  }

  restore();
  show(current, "init");
})();
