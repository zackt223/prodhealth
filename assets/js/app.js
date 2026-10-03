/*!
 * #prodhealth — App
 * Copyright (c) 2026 Zackariah Telsem — MIT License
 */
(function () {
  /* Set this to your repository URL after publishing to show a "Star on GitHub" link in the footer. */
  const REPO_URL = "https://github.com/zackt223/prodhealth";

  const { line, stacked, hbars, heatmap, stars, spark, tip, fmtDate } = window.PHCharts;
  const G = window.ProdHealthGrader;
  const CASES = window.PRODHEALTH_CASES;
  const CATS = window.PRODHEALTH_CATEGORIES;
  const $ = (q, r = document) => r.querySelector(q);
  const $$ = (q, r = document) => [...r.querySelectorAll(q)];
  const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pct = (x, d = 0) => (x == null || isNaN(x) ? "–" : (x * 100).toFixed(d) + "%");
  const num = (x) => Math.round(x).toLocaleString();
  const compact = (x) => new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(x);
  const sum = (a) => a.reduce((x, y) => x + y, 0);

  const S = {
    data: null,
    range: 90,
    topic: null,
    view: "overview",
    fb: { q: "", thumb: "all", topic: "", reason: "", version: "", limit: 30 },
    suite: {
      baseline: { label: "v2.4 (current)", responses: Object.fromEntries(CASES.map((c) => [c.id, c.demo?.baseline])) },
      candidate: { label: "v2.5 (new)", responses: Object.fromEntries(CASES.map((c) => [c.id, c.demo?.candidate])) },
      cat: "all", filter: "all", ran: false, report: null, open: new Set()
    }
  };

  /* =========================================================
     Springs (damping ratio + response, like SwiftUI)
     ========================================================= */
  function springer({ damping = 1, response = 0.35, onUpdate }) {
    const k = Math.pow((2 * Math.PI) / response, 2), c = (4 * Math.PI * damping) / response;
    const st = { x: null, v: 0, to: 0, raf: 0, last: 0 };
    function step(now) {
      const dt = Math.min(0.05, (now - st.last) / 1000); st.last = now;
      for (let i = 0; i < 4; i++) { const h = dt / 4; st.v += (-k * (st.x - st.to) - c * st.v) * h; st.x += st.v * h; }
      const done = Math.abs(st.v) < 0.02 && Math.abs(st.x - st.to) < 0.02;
      if (done) { st.x = st.to; st.v = 0; }
      onUpdate(st.x, st.v);
      st.raf = done ? 0 : requestAnimationFrame(step);
    }
    return {
      set(to, immediate) {
        st.to = to;
        if (st.x == null || immediate || reduceMotion()) { st.x = to; st.v = 0; onUpdate(to, 0); return; }
        if (!st.raf) { st.last = performance.now(); st.raf = requestAnimationFrame(step); } // re-target from the live value
      }
    };
  }

  /* Sliding highlight: separate springs for x and width. Critically damped (no bounce) because a tap carries no momentum. */
  function lens(el, container, { damping = 1, response = 0.34 } = {}) {
    let x = 0, w = 0, vx = 0;
    const paint = () => { const stretch = Math.min(0.08, Math.abs(vx) / 9000); el.style.transform = `translateX(${x}px) scaleX(${1 + stretch})`; el.style.width = w + "px"; };
    const sx = springer({ damping, response, onUpdate: (v, vel) => { x = v; vx = vel; paint(); } });
    const sw = springer({ damping: 1, response, onUpdate: (v) => { w = v; paint(); } });
    return {
      to(target, immediate) {
        if (!target) return;
        const cr = container.getBoundingClientRect(), tr = target.getBoundingClientRect();
        sx.set(tr.left - cr.left, immediate); sw.set(tr.width, immediate);
      }
    };
  }

  /* =========================================================
     Small UI helpers
     ========================================================= */
  function toast(html, ms = 2600) {
    const t = $("#toast");
    t.innerHTML = html;
    t.classList.add("is-on");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("is-on"), ms);
  }

  function countUp(el, to, fmt, ms = 900) {
    if (reduceMotion() || window.__phQuiet) { el.textContent = fmt(to); return; }
    const from = +el.dataset.v || 0, t0 = performance.now();
    el.dataset.v = to;
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(from + (to - from) * e);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function download(name, text, type = "text/plain") {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function haptic(pattern) { try { navigator.vibrate && navigator.vibrate(pattern); } catch (e) {} }

  function setupSeg(root, onChange) {
    const thumb = $(".seg-thumb", root);
    const L = lens(thumb, root, { damping: 1, response: 0.3 });
    const sel = () => $('[aria-selected="true"]', root);
    requestAnimationFrame(() => L.to(sel(), true));
    root.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b || b.getAttribute("aria-selected") === "true") return;
      $$("button", root).forEach((x) => x.setAttribute("aria-selected", x === b));
      L.to(b);
      onChange(b);
    });
    new ResizeObserver(() => L.to(sel(), true)).observe(root);
    return L;
  }

  /* =========================================================
     Data helpers
     ========================================================= */
  function windowDays() {
    const days = S.data.days;
    const n = S.range === "all" ? days.length : Math.min(S.range, days.length);
    return { cur: days.slice(-n), prev: days.slice(Math.max(0, days.length - 2 * n), days.length - n), n };
  }
  function topicList() { return S.topic ? [S.topic] : S.data.topics; }
  function agg(days, topics = topicList()) {
    let up = 0, down = 0; const reasons = {}; const st = [0, 0, 0, 0, 0]; let q = 0, qn = 0;
    for (const d of days) {
      for (const t of topics) {
        const tt = d.topics[t]; if (!tt) continue;
        up += tt.up; down += tt.down;
        for (const r in tt.reasons) reasons[r] = (reasons[r] || 0) + tt.reasons[r];
      }
      d.stars.forEach((v, i) => (st[i] += v));
      if (d.quality != null) { q += d.quality; qn++; }
    }
    return { up, down, n: up + down, sat: up + down ? up / (up + down) : null, reasons, stars: st, quality: qn ? q / qn : null };
  }
  function dailySat(days, topics = topicList()) { return days.map((d) => agg([d], topics).sat); }
  function rolling(vals, w = 7) {
    return vals.map((_, i) => {
      const s = vals.slice(Math.max(0, i - w + 1), i + 1).filter((v) => v != null);
      return s.length ? sum(s) / s.length : null;
    });
  }
  function rollingSat(allDays, from, w = 7, topics = topicList()) {
    // satisfaction computed over a trailing window of raw counts (not an average of ratios)
    return allDays.slice(from).map((_, k) => {
      const i = from + k;
      return agg(allDays.slice(Math.max(0, i - w + 1), i + 1), topics).sat;
    });
  }
  const topEntry = (o) => Object.entries(o).sort((a, b) => b[1] - a[1])[0] || ["–", 0];
  const emojiFor = (t) => (window.PHData.TOPIC_EMOJI[t] || "💬");

  /* =========================================================
     OVERVIEW
     ========================================================= */
  function verdictWords(v) {
    return { ship: ["✅", "Ready to ship", "good"], caution: ["⚠️", "Needs a look", "warn"], block: ["🛑", "Don't ship yet", "bad"] }[v];
  }
  const shortName = (label) => label.split(" ")[0];
  const rangeWords = () => (S.range === "all" ? "overall" : `in the last ${S.range} days`);

  function renderOverview() {
    const { cur, prev } = windowDays();
    const all = S.data.days, from = all.length - cur.length;
    const A = agg(cur), P = prev.length ? agg(prev) : null;
    const satTrend = rollingSat(all, from);
    const qTrend = rolling(cur.map((d) => d.quality));
    const hasQuality = qTrend.some((v) => v != null);
    const report = suiteReport();
    const prevWords = S.range === "all" ? "" : `vs. the ${S.range} days before`;

    /* ---- KPIs ---- */
    const deltaPP = (a, b) => (a == null || b == null ? null : (a - b) * 100);
    const kp = [
      { id: "sat", emoji: "👍", label: "Thumbs-up rate", value: A.sat, fmt: (v) => pct(v, 1), delta: P && deltaPP(A.sat, P.sat), unit: "pts", good: 1, spark: satTrend, cls: "s1", hint: prevWords },
      { id: "q", emoji: "🧠", label: "Answer score", value: A.quality, fmt: (v) => (v == null ? "–" : v.toFixed(0)), delta: P && A.quality != null && P.quality != null ? A.quality - P.quality : null, unit: "pts", good: 1, spark: qTrend, cls: "s1", hint: hasQuality ? "Out of 100, graded by an AI judge" : "Add a quality column to see this" },
      { id: "vol", emoji: "💬", label: "Ratings", value: A.n, fmt: (v) => compact(v), delta: null, cls: "s1", spark: cur.map((d) => agg([d]).n), hint: `${compact(A.down)} were 👎` },
      { id: "gate", emoji: "🧪", label: `Next update (${shortName(S.suite.candidate.label)})`, value: report.passRate, fmt: (v) => pct(v), delta: null, verdict: report.verdict, hint: "of tests passed · see why →" }
    ];
    const box = $("#kpis");
    if (!box.children.length) {
      box.innerHTML = kp.map((k, i) => `
        <article class="kpi glass" data-kpi="${k.id}" style="--i:${i}" ${k.id === "gate" ? 'role="link" tabindex="0" title="Open the tests"' : ""}>
          <div class="kpi-top">${E(k.emoji)}<span class="kpi-label"></span></div>
          <div class="kpi-value"><span class="v">–</span><span class="delta"></span></div>
          <div class="kpi-foot"><span class="hint"></span><span class="kpi-spark"></span></div>
        </article>`).join("");
      $('[data-kpi="gate"]').addEventListener("click", () => (location.hash = "#suite"));
      $('[data-kpi="gate"]').addEventListener("keydown", (e) => e.key === "Enter" && (location.hash = "#suite"));
      $$(".kpi", box).forEach((el) => window.PHReveal && PHReveal.watch(el, "in"));
    }
    kp.forEach((k) => {
      const el = $(`[data-kpi="${k.id}"]`);
      $(".kpi-label", el).textContent = k.label;
      countUp($(".v", el), k.value ?? 0, k.value == null ? () => "–" : k.fmt);
      const d = $(".delta", el);
      if (k.verdict) {
        const V = verdictWords(k.verdict);
        d.className = `delta badge ${V[2]}`; d.innerHTML = `${E(V[0])} ${V[1]}`;
      } else if (k.delta == null || isNaN(k.delta)) { d.className = "delta"; d.textContent = ""; }
      else {
        const up = k.delta > 0, tone = k.good ? (Math.abs(k.delta) < 0.05 ? "" : up ? "good" : "bad") : "";
        d.className = `delta ${tone}`;
        d.textContent = `${up ? "▲" : "▼"} ${Math.abs(k.delta).toFixed(1)}`;
        d.title = `Change in points ${prevWords}`;
      }
      $(".hint", el).textContent = k.hint || "";
      if (k.spark) spark($(".kpi-spark", el), k.spark, k.cls);
    });

    /* ---- Trend ---- */
    const vals = [...satTrend, ...qTrend].filter((v) => v != null).map((v) => (v <= 1 ? v * 100 : v));
    const lo = Math.max(0, Math.floor((Math.min(...vals) - 4) / 5) * 5), hi = Math.min(100, Math.ceil((Math.max(...vals) + 3) / 5) * 5);
    const markers = S.data.releases
      .map((r) => ({ index: cur.findIndex((d) => PHData.dayKey(d.date) === PHData.dayKey(r.date)), label: r.version, note: r.note }))
      .filter((m) => m.index >= 0);
    const series = [{ name: "👍 rate", cls: "s1", values: satTrend.map((v) => (v == null ? null : v * 100)) }];
    if (hasQuality) series.push({ name: "Answer score", cls: "s2", values: qTrend });
    line($("#chart-trend"), { dates: cur.map((d) => d.date), series, yMin: lo, yMax: hi, yFmt: (v) => String(Math.round(v)), markers, label: "Thumbs-up rate and answer score over time" });
    $("#trend-sub").textContent = `7-day average · ${S.topic ? S.topic : "all topics"}`;
    $("#trend-legend").innerHTML = `<span><i class="ln s1"></i>👍 rate (%)</span>${hasQuality ? '<span><i class="ln dash s2"></i>Answer score</span>' : ""}<span><i class="mk"></i>Update shipped</span>`;

    /* ---- Where (thumbs-down rate by topic) ---- */
    const rows = S.data.topics.map((t) => {
      const a = agg(cur, [t]), b = prev.length ? agg(prev, [t]) : null;
      const rate = a.n ? a.down / a.n : 0, prate = b && b.n ? b.down / b.n : null;
      const delta = prate == null ? 0 : rate - prate;
      const [tr] = topEntry(a.reasons);
      return {
        key: t, label: t, emoji: emojiFor(t), value: rate, display: pct(rate, 0), delta, active: S.topic === t,
        deltaText: prate == null || Math.abs(delta) < 0.0005 ? "" : `${delta > 0 ? "▲" : "▼"} ${Math.abs(delta * 100).toFixed(1)}`,
        tooltip: `<div class="tt-row">Got a 👎<b>${pct(rate, 1)}</b></div><div class="tt-row">Number of 👎<b>${num(a.down)}</b></div><div class="tt-row">Main reason<b>${esc(tr)}</b></div>${prate != null ? `<div class="tt-row muted">Before<b>${pct(prate, 1)}</b></div>` : ""}<div class="tt-row muted">${S.topic === t ? "Tap to show all topics" : "Tap to focus on this topic"}</div>`
      };
    }).sort((a, b) => b.value - a.value);
    hbars($("#chart-where"), rows, { onClick: (r) => setTopic(S.topic === r.key ? null : r.key) });
    $("#chart-where").classList.toggle("has-active", !!S.topic);

    /* ---- Reasons heatmap ---- */
    const allR = agg(cur, S.data.topics).reasons;
    const reasons = S.data.reasons.slice().sort((a, b) => (allR[b] || 0) - (allR[a] || 0));
    const matrix = reasons.map((r) => S.data.topics.map((t) => agg(cur, [t]).reasons[r] || 0));
    heatmap($("#chart-reasons"), reasons, S.data.topics, matrix, { fmt: compact, colEmoji: window.PHData.TOPIC_EMOJI });
    if (S.topic) $$(".hm-col", $("#chart-reasons")).forEach((c, j) => c.classList.toggle("is-active", S.data.topics[j] === S.topic));

    renderSummary(A, P, report);
    renderReleases();
    if (!$("#more-charts").hidden) renderMore();
  }

  function renderMore() {
    const { cur } = windowDays();
    const A = agg(cur);
    const daily = cur.length <= 45;
    const buckets = [];
    cur.forEach((d, i) => {
      if (daily || i % 7 === 0) buckets.push({ start: d.date, end: d.date, up: 0, down: 0 });
      const b = buckets[buckets.length - 1], a = agg([d]);
      b.up += a.up; b.down += a.down; b.end = d.date;
    });
    stacked($("#chart-volume"), {
      labels: buckets.map((b) => fmtDate(b.start)),
      titles: buckets.map((b) => (daily ? fmtDate(b.start, true) : `${fmtDate(b.start)} – ${fmtDate(b.end)}`)),
      series: [{ name: "👍", cls: "s3", values: buckets.map((b) => b.up) }, { name: "👎", cls: "s4", values: buckets.map((b) => b.down) }],
      fmt: compact, label: "Ratings per week"
    });
    $("#volume-sub").textContent = `${daily ? "Per day" : "Per week"} · ${S.topic || "all topics"}`;
    const totalStars = sum(A.stars);
    const avg = totalStars ? sum(A.stars.map((v, i) => v * (i + 1))) / totalStars : null;
    countUp($("#stars-avg"), avg ?? 0, (v) => (avg == null ? "–" : v.toFixed(1)));
    $("#stars-glyphs").innerHTML = avg == null ? "" : [1, 2, 3, 4, 5].map((i) => `<i class="star" style="--f:${Math.max(0, Math.min(1, avg - i + 1))}"></i>`).join("");
    $("#stars-sub").textContent = `Average of ${num(totalStars)} ratings`;
    stars($("#chart-stars"), A.stars);
  }

  function setTopic(t) {
    S.topic = t;
    haptic(8);
    renderOverview();
    const chip = $("#filter-chip");
    chip.hidden = !t;
    if (t) { chip.textContent = `Only ${t}`; chip.title = "Show all topics"; }
  }

  /* Plain-language summary: the three things worth knowing right now */
  function renderSummary(A, P, report) {
    const li = [];
    // 1. overall
    if (A.sat != null) {
      const d = P && P.sat != null ? (A.sat - P.sat) * 100 : null;
      const change = d == null || Math.abs(d) < 0.3 ? "" : d > 0 ? `, <span class="t-good">up ${d.toFixed(1)} points</span>` : `, <span class="t-bad">down ${Math.abs(d).toFixed(1)} points</span>`;
      li.push(`<li><span class="ico">${E(A.sat >= 0.85 ? "😊" : A.sat >= 0.7 ? "😐" : "😟")}</span><span><b>${pct(A.sat)}</b> of answers${S.topic ? ` about ${esc(S.topic)}` : ""} got a 👍 ${rangeWords()}${change}.</span></li>`);
    }
    // 2. what needs attention (last 14 days vs the 14 before)
    const days = S.data.days;
    if (days.length >= 28) {
      const last = days.slice(-14), before = days.slice(-28, -14);
      const items = S.data.topics.map((t) => {
        const a = agg(last, [t]), b = agg(before, [t]);
        const ra = a.n ? a.down / a.n : 0, rb = b.n ? b.down / b.n : 0;
        const [reason, rc] = topEntry(a.reasons);
        return { t, ra, rb, d: ra - rb, reason, share: a.down ? rc / a.down : 0, down: a.down };
      });
      const worst = items.filter((x) => x.d > 0.012 && x.down >= 15).sort((a, b) => b.d - a.d)[0];
      const best = items.filter((x) => x.d < -0.012).sort((a, b) => a.d - b.d)[0];
      if (worst) li.push(`<li><span class="ico">${E("🔥")}</span><span><b>${esc(worst.t)}</b> needs a look. Complaints went from ${pct(worst.rb)} to <span class="t-bad">${pct(worst.ra)}</span> in two weeks, mostly “${esc(worst.reason.toLowerCase())}”.<button class="go" data-goto-topic="${esc(worst.t)}" data-goto-reason="${esc(worst.reason)}">Read them</button></span></li>`);
      else li.push(`<li><span class="ico">${E("✨")}</span><span>No topic got worse in the last two weeks.</span></li>`);
      if (best && !S.topic) li.push(`<li><span class="ico">${E("📈")}</span><span><b>${esc(best.t)}</b> is getting better: complaints dropped from ${pct(best.rb)} to <span class="t-good">${pct(best.ra)}</span>.</span></li>`);
    }
    // 3. next release
    const V = verdictWords(report.verdict);
    const why = report.verdict === "ship" ? "Every important test passed." : report.criticalFails.length ? `${report.criticalFails.length} must-pass test${report.criticalFails.length > 1 ? "s" : ""} failed.` : report.regressions.length ? `${report.regressions.length} answer${report.regressions.length > 1 ? "s" : ""} got worse.` : `Only ${pct(report.passRate)} of tests passed.`;
    li.push(`<li><span class="ico">${E(V[0])}</span><span>The next update (${esc(shortName(S.suite.candidate.label))}) is <b class="t-${V[2]}">${V[1].toLowerCase()}</b>. ${why}<button class="go" data-goto="suite">See tests</button></span></li>`);
    $("#summary-list").innerHTML = li.join("");
    $$("[data-goto-topic]", $("#summary-list")).forEach((b) => b.addEventListener("click", () => {
      Object.assign(S.fb, { topic: b.dataset.gotoTopic, reason: b.dataset.gotoReason, thumb: "down", q: "", version: "", limit: 30 });
      syncFeedbackControls();
      location.hash = "#feedback";
    }));
    $$("[data-goto]", $("#summary-list")).forEach((b) => b.addEventListener("click", () => (location.hash = "#" + b.dataset.goto)));
    paintBadge(report);
  }

  /* Red count on the Tests tab, so problems are visible from anywhere */
  function paintBadge(rep) {
    const badge = $("#tab-badge");
    const issues = rep.criticalFails.length + rep.regressions.filter((r) => r.case.severity !== "critical").length;
    badge.hidden = !issues;
    badge.textContent = issues;
    badge.title = `${issues} problem${issues === 1 ? "" : "s"} to fix`;
  }

  function renderReleases() {
    const days = S.data.days;
    const keyIdx = new Map(days.map((d, i) => [PHData.dayKey(d.date), i]));
    const rows = S.data.releases.map((r) => {
      const i = keyIdx.get(PHData.dayKey(r.date));
      if (i == null || i < 3) return null;
      const before = days.slice(Math.max(0, i - 7), i), after = days.slice(i + 1, i + 8);
      if (after.length < 3) return { ...r, pending: true };
      const a = agg(before, S.data.topics), b = agg(after, S.data.topics);
      const movers = S.data.topics.map((t) => ({ t, d: (agg(after, [t]).sat ?? 0) - (agg(before, [t]).sat ?? 0) })).sort((x, y) => Math.abs(y.d) - Math.abs(x.d));
      return { ...r, before: a.sat, after: b.sat, d: b.sat - a.sat, mover: movers[0] };
    }).filter(Boolean).reverse();
    $("#releases").innerHTML = rows.length ? rows.map((r, k) => `
      <div class="rel" style="--i:${k}">
        <span class="rel-ver">${esc(r.version)}</span>
        <div class="rel-meta"><b>${esc(r.note || "")}</b><span>${fmtDate(r.date, true)}</span></div>
        ${r.pending ? `<span class="rel-delta">Still collecting data</span>` : `
        <div class="rel-bar"><span class="${r.d < 0 ? "bad" : "good"}" style="--w:${Math.min(100, Math.abs(r.d) * 100 * 12)}%"></span></div>
        <span class="rel-delta ${r.d < -0.003 ? "bad" : r.d > 0.003 ? "good" : ""}">${r.d < -0.003 ? "▼ " : r.d > 0.003 ? "▲ " : ""}${Math.abs(r.d * 100).toFixed(1)} pts</span>
        <span class="rel-mover">${Math.abs(r.mover.d) > 0.01 ? `Biggest change: ${E(emojiFor(r.mover.t))} ${esc(r.mover.t)} ${r.mover.d > 0 ? "+" : "−"}${Math.abs(r.mover.d * 100).toFixed(0)}` : "No big change in any topic"}</span>`}
      </div>`).join("") : `<p class="empty">No updates found. Add a <code>version</code> column to your data to see this.</p>`;
  }

  /* =========================================================
     FEEDBACK
     ========================================================= */
  function syncFeedbackControls() {
    const opt = (sel, items, all, cur) => {
      sel.innerHTML = `<option value="">${all}</option>` + items.map((x) => `<option ${x === cur ? "selected" : ""}>${esc(x)}</option>`).join("");
      sel.classList.toggle("is-set", !!cur);
    };
    opt($("#fb-topic"), S.data.topics, "Any topic", S.fb.topic);
    opt($("#fb-reason"), S.data.reasons, "Any reason", S.fb.reason);
    const versions = [...new Set(S.data.feed.map((f) => f.version).filter(Boolean))];
    opt($("#fb-version"), versions.reverse(), "Any version", S.fb.version);
    $("#fb-search").value = S.fb.q;
    const seg = $("#fb-thumb");
    $$("button", seg).forEach((b) => b.setAttribute("aria-selected", b.dataset.v === S.fb.thumb));
    seg._lens && requestAnimationFrame(() => seg._lens.to($('[aria-selected="true"]', seg)));
    $("#fb-clear").hidden = !(S.fb.q || S.fb.thumb !== "all" || S.fb.topic || S.fb.reason || S.fb.version);
  }

  function setFeedbackFilter(patch) {
    Object.assign(S.fb, patch, { limit: 30 });
    syncFeedbackControls();
    renderFeedback();
  }

  function filteredFeed() {
    const { cur } = windowDays();
    const start = cur[0].date.getTime() - 864e5 / 2;
    const q = S.fb.q.trim().toLowerCase();
    return S.data.feed.filter((f) =>
      f.ts.getTime() >= start &&
      (S.fb.thumb === "all" || f.thumb === S.fb.thumb) &&
      (!S.fb.topic || f.topic === S.fb.topic) &&
      (!S.fb.reason || f.reason === S.fb.reason) &&
      (!S.fb.version || f.version === S.fb.version) &&
      (!q || (f.comment + " " + f.prompt).toLowerCase().includes(q)));
  }

  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  function ago(d) {
    const s = (d - Date.now()) / 1000;
    const units = [["day", 86400], ["hour", 3600], ["minute", 60]];
    for (const [u, n] of units) if (Math.abs(s) >= n || u === "minute") return rtf.format(Math.round(s / n), u);
  }

  function renderFeedback() {
    const list = filteredFeed();
    const downs = list.filter((f) => f.thumb === "down").length;
    $("#fb-meta").textContent = list.length ? `${num(list.length)} comments · ${num(downs)} with a 👎 · newest first` : "";
    const shown = list.slice(0, S.fb.limit);
    $("#feed").innerHTML = shown.length ? shown.map((f, i) => `
      <article class="fb glass ${f.thumb}" style="--i:${Math.min(i, 12)}">
        <div class="fb-thumb" aria-label="${f.thumb === "down" ? "Thumbs down" : "Thumbs up"}">${E(f.thumb === "down" ? "👎" : "👍")}</div>
        <div class="fb-body">
          <p class="fb-comment">${esc(f.comment)}</p>
          ${f.prompt ? `<p class="fb-prompt"><span>They asked:</span> ${esc(f.prompt)}</p>` : ""}
          <div class="fb-tags">
            <button class="tag" data-f-topic="${esc(f.topic)}" title="Only show ${esc(f.topic)}">${E(emojiFor(f.topic))} ${esc(f.topic)}</button>
            ${f.reason ? `<button class="tag warn" data-f-reason="${esc(f.reason)}" title="Only show “${esc(f.reason)}”">${esc(f.reason)}</button>` : ""}
            ${f.stars ? `<span class="tag" aria-label="${f.stars} stars">${"★".repeat(f.stars)}<span class="dim">${"★".repeat(5 - f.stars)}</span></span>` : ""}
            ${f.version ? `<button class="tag mono" data-f-version="${esc(f.version)}" title="Only show ${esc(f.version)}">${esc(f.version)}</button>` : ""}
            <span class="time" title="${f.ts.toLocaleString()}">${ago(f.ts)}</span>
          </div>
        </div>
      </article>`).join("") : `<div class="empty glass">${E("🫥")} Nothing matches. <button class="link-btn" data-clear>Clear filters</button></div>`;
    $("#fb-more").hidden = list.length <= S.fb.limit;
    $("#fb-more").textContent = `Show more (${num(list.length - S.fb.limit)} left)`;
  }

  function exportFeedback() {
    const rows = filteredFeed();
    const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = ["timestamp,thumb,stars,topic,reason,version,prompt,comment", ...rows.map((f) => [f.ts.toISOString(), f.thumb, f.stars ?? "", f.topic, f.reason ?? "", f.version, f.prompt, f.comment].map(q).join(","))].join("\n");
    download(`prodhealth-comments-${PHData.dayKey(Date.now())}.csv`, csv, "text/csv");
    toast(`${E("✅")} Downloaded ${num(rows.length)} comments`);
  }

  /* =========================================================
     TEST SUITE
     ========================================================= */
  function suiteReport() {
    return (S.suite.report ||= G.compare(CASES, S.suite.baseline.responses, S.suite.candidate.responses, { minPass: 0.9 }));
  }

  const SEV = { critical: "Must pass", high: "Important", medium: "Nice to have" };
  const statusIcon = (g) => (!g ? "" : g.missing ? E("➖") : g.pass ? E("✅") : E("❌"));

  function renderSuiteChrome() {
    const cats = ["all", ...Object.keys(CATS)];
    $("#cat-chips").innerHTML = cats.map((c) => `<button class="chip ${S.suite.cat === c ? "is-on" : ""}" data-cat="${c}">${c === "all" ? "All topics" : `${E(CATS[c].emoji)} ${CATS[c].label}`}</button>`).join("");
    $("#runs").innerHTML = `Testing <b>${esc(S.suite.candidate.label)}</b> against <b>${esc(S.suite.baseline.label)}</b>`;
  }

  function caseRow(r) {
    const c = r.case, cat = CATS[c.category] || { emoji: "🧩", label: c.category };
    const open = S.suite.open.has(c.id);
    const chg = r.change === "regression" ? `<span class="badge bad">Got worse</span>` : r.change === "fixed" ? `<span class="badge good">Got better</span>` : "";
    return `
    <article class="case glass ${open ? "is-open" : ""} ${r.candidate.pass ? "pass" : "fail"}" data-id="${c.id}">
      <button class="case-head" aria-expanded="${open}">
        <span class="case-emoji">${E(cat.emoji)}</span>
        <span class="case-title"><b>${esc(c.title)}</b><span class="case-sub">${cat.label}</span></span>
        <span class="sev ${c.severity}">${SEV[c.severity]}</span>
        ${chg}
        <span class="case-status" title="Current version → new version"><span class="st st-b">${statusIcon(r.baseline)}</span><span class="arrow">→</span><span class="st st-c">${statusIcon(r.candidate)}</span></span>
        <span class="chev" aria-hidden="true"></span>
      </button>
      <div class="case-body"><div class="case-inner">${open ? caseBody(r) : ""}</div></div>
    </article>`;
  }

  function checksList(g) {
    return `<ul class="checks">${g.results.map((x) => `<li class="${x.pass ? "ok" : "no"}">${E(x.pass ? "✅" : "❌")}<span><b>${esc(x.label)}</b><small>${esc(x.detail)}</small></span></li>`).join("")}</ul>`;
  }

  function caseBody(r) {
    const c = r.case;
    const resp = (k) => S.suite[k].responses[c.id];
    return `
      <div class="case-grid">
        <div class="case-block"><h4>What we asked</h4><pre class="prompt">${esc(c.prompt)}</pre></div>
        <div class="case-block"><h4>Why it's tricky</h4><p>${esc(c.why)}</p><h4>A good answer</h4><p>${esc(c.expected)}</p></div>
      </div>
      <div class="case-grid">
        ${r.baseline ? `<div class="case-block resp"><h4>${statusIcon(r.baseline)} Current version · ${esc(S.suite.baseline.label)}</h4><pre>${esc(resp("baseline") ?? "No answer")}</pre>${checksList(r.baseline)}</div>` : ""}
        <div class="case-block resp"><h4>${statusIcon(r.candidate)} New version · ${esc(S.suite.candidate.label)}</h4><pre>${esc(resp("candidate") ?? "No answer")}</pre>${checksList(r.candidate)}</div>
      </div>
      <div class="case-block try">
        <h4>Try your own answer</h4>
        <textarea rows="3" placeholder="Paste any AI's answer here to see if it passes…" data-try="${c.id}"></textarea>
        <div class="try-out" data-try-out="${c.id}"></div>
      </div>`;
  }

  function visibleRows() {
    const rep = suiteReport();
    return rep.rows.filter((r) =>
      (S.suite.cat === "all" || r.case.category === S.suite.cat) &&
      (S.suite.filter === "all" ||
        (S.suite.filter === "failing" && !r.candidate.pass) ||
        (S.suite.filter === "changed" && r.change !== "same") ||
        (S.suite.filter === "critical" && r.case.severity === "critical")));
  }

  function renderCases(pending) {
    const rows = visibleRows();
    $("#cases").innerHTML = rows.length ? rows.map(caseRow).join("") : `<div class="empty glass">${E("🫧")} Nothing here. Try another filter.</div>`;
    if (pending) $$(".case", $("#cases")).forEach((el) => el.classList.add("pending"));
  }

  function plainReason(rep) {
    const n = (k, one, many) => `${k} ${k === 1 ? one : many}`;
    if (rep.criticalFails.length) return `${n(rep.criticalFails.length, "must-pass test", "must-pass tests")} failed. Fix ${rep.criticalFails.length === 1 ? "it" : "them"} before shipping.`;
    if (rep.regressions.length) return `${n(rep.regressions.length, "answer", "answers")} got worse than the current version.`;
    if (rep.verdict === "caution") return `Only ${pct(rep.passRate)} passed. Aim for 90% or more.`;
    return "Every important test passed, and nothing got worse.";
  }

  function renderGate(rep, animate) {
    const V = verdictWords(rep.verdict);
    const v = $("#verdict");
    v.dataset.state = rep.verdict;
    $("#verdict-emoji").innerHTML = E(V[0]);
    $("#verdict-text").textContent = V[1];
    $("#gate-reason").textContent = plainReason(rep);
    if (animate && !reduceMotion()) v.animate([{ opacity: 0, transform: "translateY(6px)", filter: "blur(6px)" }, { opacity: 1, transform: "none", filter: "blur(0)" }], { duration: 450, easing: "cubic-bezier(.22,1,.36,1)" });
    countUp($("#gate-rate"), rep.passRate, (x) => pct(x));
    $("#ring-fg").style.strokeDashoffset = 100 - rep.passRate * 100;
    $("#ring-fg").dataset.state = rep.verdict;
    const stat = (n, l, tone) => `<div class="gstat ${tone || ""}"><b>${n}</b><small>${l}</small></div>`;
    $("#gate-stats").innerHTML =
      stat(`${rep.passed} of ${rep.total}`, "passed") +
      stat(rep.criticalFails.length, "must-pass failed", rep.criticalFails.length ? "bad" : "") +
      stat(rep.regressions.length, "got worse", rep.regressions.length ? "bad" : "") +
      stat(rep.fixes.length, "got better", rep.fixes.length ? "good" : "");
    paintBadge(rep);
  }

  let running = false;
  async function runSuite() {
    if (running) return;
    running = true;
    S.suite.report = null;
    const rep = suiteReport();
    const btn = $("#run-btn");
    btn.disabled = true;
    btn.textContent = "Testing…";
    $("#verdict").dataset.state = "running";
    $("#verdict-emoji").innerHTML = E("⏳");
    $("#verdict-text").textContent = "Testing…";
    $("#gate-reason").textContent = `Asking ${rep.rows.length} tricky questions and checking each answer.`;
    $("#ring-fg").style.strokeDashoffset = 100;
    $("#ring-fg").dataset.state = "running";
    renderCases(true);
    const els = $$(".case", $("#cases"));
    const fast = reduceMotion();
    let passed = 0, done = 0;
    for (const r of rep.rows) {
      const el = els.find((e) => e.dataset.id === r.case.id);
      done++; if (r.candidate.pass) passed++;
      $("#gate-rate").textContent = pct(passed / done);
      $("#ring-fg").style.strokeDashoffset = 100 - (done / rep.rows.length) * 100;
      if (el) { el.classList.remove("pending"); el.classList.add("revealed"); }
      if (!fast) await new Promise((res) => setTimeout(res, el ? 55 : 8));
    }
    renderGate(rep, true);
    haptic(rep.verdict === "block" ? [30, 60, 30] : 15);
    renderCases();
    S.suite.ran = true;
    btn.disabled = false;
    btn.textContent = "Run again";
    running = false;
    if (S.view === "overview") renderOverview();
  }

  function releaseReport() {
    const rep = suiteReport();
    const V = verdictWords(rep.verdict);
    const lines = [
      `# ${S.suite.candidate.label}: ${V[0]} ${V[1]}`, "",
      plainReason(rep), "",
      `| | |`, `|---|---|`,
      `| Tests passed | ${rep.passed} of ${rep.total} (${pct(rep.passRate)}) |`,
      rep.baselinePassRate != null ? `| Current version (${S.suite.baseline.label}) | ${pct(rep.baselinePassRate)} |` : "",
      `| Must-pass tests failed | ${rep.criticalFails.length} |`, `| Got worse | ${rep.regressions.length} |`, `| Got better | ${rep.fixes.length} |`, ""
    ].filter((l) => l !== "");
    const section = (title, rows) => rows.length && lines.push("", `## ${title}`, "", ...rows.map((r) => `- **${r.case.title}** (${SEV[r.case.severity].toLowerCase()}): ${r.candidate.results.filter((x) => !x.pass).map((x) => `${x.label}. ${x.detail}`).join("; ") || "passes"}`));
    section("Must-pass tests that failed", rep.criticalFails);
    section("Got worse", rep.regressions.filter((r) => r.case.severity !== "critical"));
    section("Got better", rep.fixes);
    lines.push("", `_Made with #prodhealth on ${new Date().toLocaleDateString()}_`);
    download(`test-report-${shortName(S.suite.candidate.label)}.md`, lines.join("\n"), "text/markdown");
    toast(`${E("✅")} Report downloaded`);
  }

  let loadTarget = "candidate";
  async function loadRun(file) {
    try {
      const j = JSON.parse(await file.text());
      const responses = j.responses || j;
      if (typeof responses !== "object" || Array.isArray(responses)) throw new Error("Expected { responses: { caseId: text } }");
      const known = CASES.filter((c) => c.id in responses).length;
      if (!known) throw new Error("This file doesn't match any of the tests.");
      S.suite[loadTarget] = { label: j.label || j.model || file.name.replace(/\.json$/, ""), responses };
      S.suite.report = null;
      renderSuiteChrome();
      toast(`${E("✅")} Loaded ${known} answers as the ${loadTarget === "candidate" ? "new" : "current"} version`);
      runSuite();
    } catch (e) { toast(`${E("⚠️")} ${esc(e.message)}`, 4200); }
  }

  /* =========================================================
     Import / data source
     ========================================================= */
  function paintSource() {
    const custom = S.data.source !== "demo";
    $("#source-pill").classList.toggle("is-custom", custom);
    $("#source-label").textContent = custom ? S.data.name || "Your data" : "Sample data";
    $("#source-cta").textContent = custom ? "Use sample" : "Use yours";
    $("#source-pill").title = custom ? "Go back to the sample data" : "Use your own feedback file (CSV or JSON)";
  }

  function setData(data) {
    S.data = data;
    S.topic = null;
    $("#filter-chip").hidden = true;
    Object.assign(S.fb, { topic: "", reason: "", version: "", thumb: "all", q: "", limit: 30 });
    paintSource();
    syncFeedbackControls();
    renderAll();
  }

  async function importFile(file) {
    try {
      const text = await file.text();
      const data = PHData.parseFile(file.name, text);
      data.name = file.name;
      try { localStorage.setItem("ph-import", JSON.stringify({ name: file.name, text })); } catch (e) {}
      S.range = "all"; selectRange("all");
      setData(data);
      toast(`${E("✅")} Loaded ${num(sum(data.days.map((d) => agg([d], data.topics).n)))} ratings from ${esc(file.name)}`);
    } catch (e) {
      toast(`${E("⚠️")} That file didn't work: ${esc(e.message)}`, 5000);
    }
  }

  function selectRange(v) {
    const seg = $("#range");
    $$("button", seg).forEach((b) => b.setAttribute("aria-selected", b.dataset.range === String(v)));
    seg._lens && seg._lens.to($('[aria-selected="true"]', seg));
  }

  /* =========================================================
     Routing
     ========================================================= */
  let tabLens;
  function route() {
    const v = (location.hash.replace("#", "") || "overview");
    const view = ["overview", "feedback", "suite"].includes(v) ? v : "overview";
    const prev = S.view;
    S.view = view;
    $$(".view").forEach((s) => {
      const on = s.dataset.view === view;
      if (on && s.hidden) {
        s.hidden = false;
        if (!reduceMotion() && prev !== view) s.animate([{ opacity: 0, transform: "translateY(10px)", filter: "blur(4px)" }, { opacity: 1, transform: "none", filter: "blur(0)" }], { duration: 400, easing: "cubic-bezier(.22,1,.36,1)" });
      } else if (!on) s.hidden = true;
    });
    $$("#tabbar a").forEach((a) => a.setAttribute("aria-current", a.dataset.tab === view ? "page" : "false"));
    tabLens.to($(`#tabbar a[data-tab="${view}"]`));
    $("#range").classList.toggle("is-hidden", view === "suite");
    const titles = { overview: "Overview", feedback: "Comments", suite: "Tests" };
    document.title = `${titles[view]} · #prodhealth`;
    if (view === "overview") renderOverview();
    if (view === "feedback") renderFeedback();
    if (view === "suite") {
      renderSuiteChrome();
      if (!S.suite.ran) { renderGate(suiteReport(), false); runSuite(); }
      else renderCases();
    }
    if (prev !== view) window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }

  function renderAll() {
    if (S.view === "overview") renderOverview();
    if (S.view === "feedback") renderFeedback();
  }

  /* =========================================================
     Menus & sheet (open from their trigger, close on Esc / outside click)
     ========================================================= */
  let openMenu = null;
  function toggleMenu(btn, menu, force) {
    const open = force ?? menu.hidden;
    if (openMenu && openMenu.menu !== menu) toggleMenu(openMenu.btn, openMenu.menu, false);
    btn.setAttribute("aria-expanded", open);
    if (open) {
      menu.hidden = false;
      requestAnimationFrame(() => menu.classList.add("is-open"));
      openMenu = { btn, menu };
      const first = menu.querySelector('[aria-checked="true"]') || menu.querySelector("button");
      first && first.focus({ preventScroll: true });
    } else {
      menu.classList.remove("is-open");
      setTimeout(() => { if (!menu.classList.contains("is-open")) menu.hidden = true; }, 220);
      if (openMenu && openMenu.menu === menu) openMenu = null;
    }
  }

  function setupMenus() {
    [["#theme-btn", "#theme-menu"], ["#suite-more", "#suite-menu"]].forEach(([b, m]) => {
      $(b).addEventListener("click", (e) => { e.stopPropagation(); toggleMenu($(b), $(m)); });
      $(m).addEventListener("click", (e) => { if (e.target.closest("button")) toggleMenu($(b), $(m), false); });
      $(m).addEventListener("keydown", (e) => {
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
        e.preventDefault();
        const items = $$("button", $(m)), i = items.indexOf(document.activeElement);
        items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length].focus();
      });
    });
    document.addEventListener("click", (e) => { if (openMenu && !openMenu.menu.contains(e.target)) toggleMenu(openMenu.btn, openMenu.menu, false); });
  }

  function sheet(open) {
    const s = $("#keys-sheet"), sc = $("#keys-scrim");
    if (open) {
      s.hidden = sc.hidden = false;
      requestAnimationFrame(() => { s.classList.add("is-open"); sc.classList.add("is-open"); });
      $("#keys-close").focus();
    } else {
      s.classList.remove("is-open"); sc.classList.remove("is-open");
      setTimeout(() => { s.hidden = sc.hidden = true; }, 260);
    }
  }

  /* =========================================================
     Themes
     ========================================================= */
  const THEMES = ["auto", "light", "dark", "graphite", "paper", "sage", "ocean", "clay"];
  function getTheme() { try { return localStorage.getItem("ph-theme") || "auto"; } catch (e) { return "auto"; } }
  function setTheme(t, announce) {
    const root = document.documentElement;
    root.classList.add("theme-anim");
    if (t === "auto") delete root.dataset.theme; else root.dataset.theme = t;
    try { localStorage.setItem("ph-theme", t); } catch (e) {}
    $$("[data-theme-opt]").forEach((b) => b.setAttribute("aria-checked", b.dataset.themeOpt === t));
    setTimeout(() => root.classList.remove("theme-anim"), 450);
    if (announce) toast(`Theme: ${t[0].toUpperCase() + t.slice(1)}`, 1400);
  }

  /* The light that follows your cursor across glass (mouse and pen only) */
  function setupSpecular() {
    if (!matchMedia("(hover: hover)").matches) return;
    let raf = 0, ev = null;
    document.addEventListener("pointermove", (e) => {
      ev = e;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const g = ev.target.closest && ev.target.closest(".glass");
        if (!g) return;
        const r = g.getBoundingClientRect();
        g.style.setProperty("--mx", ev.clientX - r.left + "px");
        g.style.setProperty("--my", ev.clientY - r.top + "px");
      });
    }, { passive: true });
  }

  /* =========================================================
     Keyboard
     ========================================================= */
  function setupKeys() {
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (openMenu) toggleMenu(openMenu.btn, openMenu.menu, false);
        else if (!$("#keys-sheet").hidden) sheet(false);
        else if (S.view === "overview" && S.topic) setTopic(null);
        else document.activeElement && document.activeElement.blur();
        return;
      }
      const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || e.metaKey || e.ctrlKey || e.altKey;
      if (typing) return;
      if (e.key === "1") location.hash = "#overview";
      else if (e.key === "2") location.hash = "#feedback";
      else if (e.key === "3") location.hash = "#suite";
      else if (e.key === "/") { e.preventDefault(); location.hash = "#feedback"; setTimeout(() => $("#fb-search").focus(), 50); }
      else if (e.key.toLowerCase() === "r") { location.hash = "#suite"; setTimeout(runSuite, 60); }
      else if (e.key.toLowerCase() === "t") setTheme(THEMES[(THEMES.indexOf(getTheme()) + 1) % THEMES.length], true);
      else if (e.key === "?") sheet(true);
    });
  }

  /* =========================================================
     Boot
     ========================================================= */
  function boot() {
    PHEmoji.start();
    $("#year").textContent = new Date().getFullYear();
    if (REPO_URL) { $("#repo-link").href = REPO_URL; $("#repo-link").hidden = false; }

    let data = null;
    try {
      const saved = JSON.parse(localStorage.getItem("ph-import") || "null");
      if (saved) { data = PHData.parseFile(saved.name, saved.text); data.name = saved.name; S.range = "all"; }
    } catch (e) {}
    if (!data) { try { const r = localStorage.getItem("ph-range"); if (r) S.range = r === "all" ? "all" : +r; } catch (e) {} }
    S.data = data || PHData.demo(120);
    paintSource();
    $$("#range button").forEach((b) => b.setAttribute("aria-selected", b.dataset.range === String(S.range)));

    tabLens = lens($("#tab-lens"), $("#tabbar"));
    $("#range")._lens = setupSeg($("#range"), (b) => {
      S.range = b.dataset.range === "all" ? "all" : +b.dataset.range; S.fb.limit = 30;
      try { localStorage.setItem("ph-range", S.range); } catch (e) {}
      renderAll();
    });
    $("#fb-thumb")._lens = setupSeg($("#fb-thumb"), (b) => setFeedbackFilter({ thumb: b.dataset.v }));
    setupSeg($("#case-filter"), (b) => { S.suite.filter = b.dataset.v; renderCases(); });

    syncFeedbackControls();
    let qt;
    $("#fb-search").addEventListener("input", (e) => { clearTimeout(qt); const v = e.target.value; qt = setTimeout(() => { S.fb.q = v; S.fb.limit = 30; renderFeedback(); $("#fb-clear").hidden = !(v || S.fb.thumb !== "all" || S.fb.topic || S.fb.reason || S.fb.version); }, 60); });
    $("#fb-topic").addEventListener("change", (e) => setFeedbackFilter({ topic: e.target.value }));
    $("#fb-reason").addEventListener("change", (e) => setFeedbackFilter({ reason: e.target.value }));
    $("#fb-version").addEventListener("change", (e) => setFeedbackFilter({ version: e.target.value }));
    $("#fb-clear").addEventListener("click", () => setFeedbackFilter({ q: "", thumb: "all", topic: "", reason: "", version: "" }));
    $("#feed").addEventListener("click", (e) => {
      const t = e.target.closest("[data-f-topic],[data-f-reason],[data-f-version],[data-clear]"); if (!t) return;
      if (t.dataset.clear != null) return setFeedbackFilter({ q: "", thumb: "all", topic: "", reason: "", version: "" });
      if (t.dataset.fTopic) setFeedbackFilter({ topic: t.dataset.fTopic });
      if (t.dataset.fReason) setFeedbackFilter({ reason: t.dataset.fReason, thumb: "down" });
      if (t.dataset.fVersion) setFeedbackFilter({ version: t.dataset.fVersion });
      window.scrollTo({ top: 0, behavior: reduceMotion() ? "auto" : "smooth" });
    });
    $("#fb-more").addEventListener("click", () => { S.fb.limit += 30; renderFeedback(); });
    $("#fb-export").addEventListener("click", exportFeedback);

    $("#filter-chip").addEventListener("click", () => setTopic(null));
    $("#more-btn").addEventListener("click", () => {
      const box = $("#more-charts"), open = box.hidden;
      box.hidden = !open;
      $("#more-btn").setAttribute("aria-expanded", open);
      $("#more-btn").textContent = open ? "Fewer charts" : "More charts";
      if (open) { renderMore(); $$(".card", box).forEach((el) => PHReveal.watch(el, "in")); box.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "nearest" }); }
    });

    $("#file-input").addEventListener("change", (e) => { const f = e.target.files[0]; if (f) importFile(f); e.target.value = ""; });
    $("#source-pill").addEventListener("click", () => {
      if (S.data.source === "demo") { $("#file-input").click(); return; }
      try { localStorage.removeItem("ph-import"); } catch (e) {}
      S.range = 90; selectRange(90);
      setData(PHData.demo(120));
      toast("Showing sample data");
    });
    // drag & drop a file anywhere
    addEventListener("dragover", (e) => { e.preventDefault(); document.body.classList.add("is-dragging"); });
    addEventListener("dragleave", (e) => { if (!e.relatedTarget) document.body.classList.remove("is-dragging"); });
    addEventListener("drop", (e) => { e.preventDefault(); document.body.classList.remove("is-dragging"); const f = e.dataTransfer.files[0]; if (f) importFile(f); });

    $("#run-btn").addEventListener("click", runSuite);
    $("#report-btn").addEventListener("click", releaseReport);
    $("#load-cand-btn").addEventListener("click", () => { loadTarget = "candidate"; $("#run-input").click(); });
    $("#load-base-btn").addEventListener("click", () => { loadTarget = "baseline"; $("#run-input").click(); });
    $("#run-input").addEventListener("change", (e) => { const f = e.target.files[0]; if (f) loadRun(f); e.target.value = ""; });
    $("#cat-chips").addEventListener("click", (e) => {
      const b = e.target.closest(".chip"); if (!b) return;
      S.suite.cat = b.dataset.cat;
      $$(".chip", $("#cat-chips")).forEach((c) => c.classList.toggle("is-on", c === b));
      renderCases();
    });
    $("#cases").addEventListener("click", (e) => {
      const head = e.target.closest(".case-head"); if (!head) return;
      const card = head.closest(".case"), id = card.dataset.id;
      const r = suiteReport().rows.find((x) => x.case.id === id);
      const open = !S.suite.open.has(id);
      open ? S.suite.open.add(id) : S.suite.open.delete(id);
      if (open) $(".case-inner", card).innerHTML = caseBody(r);
      card.classList.toggle("is-open", open);
      head.setAttribute("aria-expanded", open);
    });
    $("#cases").addEventListener("input", (e) => {
      const ta = e.target.closest("[data-try]"); if (!ta) return;
      const c = CASES.find((x) => x.id === ta.dataset.try);
      const out = $(`[data-try-out="${c.id}"]`);
      if (!ta.value.trim()) { out.innerHTML = ""; return; }
      const g = G.grade(c, ta.value);
      out.innerHTML = `<div class="try-verdict ${g.pass ? "good" : "bad"}">${E(g.pass ? "✅" : "❌")} ${g.pass ? "This answer passes" : "This answer fails"}</div>${checksList(g)}`;
    });

    setupMenus();
    $$("[data-theme-opt]").forEach((b) => b.addEventListener("click", () => setTheme(b.dataset.themeOpt)));
    $$("[data-theme-opt]").forEach((b) => b.setAttribute("aria-checked", b.dataset.themeOpt === getTheme()));
    setupKeys();
    setupSpecular();
    $("#keys-btn").addEventListener("click", () => sheet(true));
    $("#keys-close").addEventListener("click", () => sheet(false));
    $("#keys-scrim").addEventListener("click", () => sheet(false));

    let rt, lastW = $("#main").clientWidth;
    new ResizeObserver(() => {
      const w = $("#main").clientWidth;
      if (w === lastW) return;
      lastW = w;
      clearTimeout(rt);
      rt = setTimeout(() => { window.__phQuiet = true; try { if (S.view === "overview") renderOverview(); } finally { window.__phQuiet = false; } tabLens.to($(`#tabbar a[data-tab="${S.view}"]`), true); }, 120);
    }).observe($("#main"));

    addEventListener("hashchange", route);
    route();
    // cards rise in as they scroll into view
    $$(".card, .kpi").forEach((el) => PHReveal.watch(el, "in"));
    addEventListener("hashchange", () => setTimeout(PHReveal.check, 30));
    document.body.classList.add("is-ready");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
