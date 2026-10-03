/*!
 * #prodhealth — Charts. Dependency-free SVG/HTML charts with hover, draw-in motion and theming via CSS tokens.
 * Copyright (c) 2026 Zackariah Telsem — MIT License
 */
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const reduce = () => window.__phQuiet || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Draw-in only once an element scrolls into view (a cheap rect check on scroll; robust everywhere)
  const pending = new Map();
  function check() {
    const limit = innerHeight * 0.94;
    pending.forEach((cls, el) => {
      if (!el.isConnected) return pending.delete(el);
      const r = el.getBoundingClientRect();
      if (r.top < limit && r.bottom > 0 && (r.width || r.height)) { el.classList.add(cls); pending.delete(el); }
    });
  }
  function watch(el, cls) { if (window.__phQuiet || el.classList.contains(cls)) return el.classList.add(cls); pending.set(el, cls); check(); }
  addEventListener("scroll", () => requestAnimationFrame(check), { passive: true });
  addEventListener("resize", check);
  window.PHReveal = { watch, check };
  function reveal(el) { watch(el, "is-drawn"); }
  const fmtDate = (d, long) => d.toLocaleDateString(undefined, long ? { weekday: "short", month: "short", day: "numeric" } : { month: "short", day: "numeric" });

  function s(tag, attrs, parent) {
    const el = document.createElementNS(NS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  }

  /* ---------- shared tooltip ---------- */
  const tip = {
    el: null,
    show(html, x, y) {
      this.el ||= document.getElementById("tooltip");
      this.el.innerHTML = html;
      this.el.classList.add("is-on");
      const r = this.el.getBoundingClientRect();
      let left = x + 16, top = y - r.height - 12;
      if (left + r.width > innerWidth - 8) left = x - r.width - 16;
      if (top < 8) top = y + 18;
      this.el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    },
    hide() { this.el && this.el.classList.remove("is-on"); }
  };

  function niceTicks(min, max, count) {
    const span = max - min || 1;
    const step0 = span / count, mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((m) => span / m <= count) || mag * 10;
    const out = [];
    for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(6));
    return out;
  }

  /* ---------- Line chart ---------- */
  // opts: { dates, series: [{ name, cls, values }], yMin, yMax, yFmt, markers: [{ index, label, note }] }
  function line(el, opts) {
    el.innerHTML = "";
    const W = el.clientWidth || 600, H = el.clientHeight || 280;
    const m = { l: 40, r: 64, t: 26, b: 28 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const n = opts.dates.length;
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "chart", role: "img", "aria-label": opts.label || "Line chart" }, el);
    const x = (i) => m.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
    const y = (v) => m.t + ih - ((v - opts.yMin) / (opts.yMax - opts.yMin)) * ih;

    const grid = s("g", { class: "grid" }, svg);
    for (const t of niceTicks(opts.yMin, opts.yMax, 4)) {
      s("line", { x1: m.l, x2: m.l + iw, y1: y(t), y2: y(t) }, grid);
      s("text", { x: m.l - 8, y: y(t) + 4, "text-anchor": "end", class: "tick" }, grid).textContent = opts.yFmt(t);
    }
    const xt = Math.max(2, Math.min(6, n, Math.floor(iw / 78)));
    for (let k = 0; k < xt; k++) {
      const i = Math.round((k / (xt - 1 || 1)) * (n - 1));
      s("text", { x: x(i), y: H - 8, "text-anchor": k === 0 ? "start" : k === xt - 1 ? "end" : "middle", class: "tick" }, grid).textContent = fmtDate(opts.dates[i]);
    }

    // release markers
    const mk = s("g", { class: "markers" }, svg);
    let lastLabelX = -1e9;
    (opts.markers || []).forEach((r) => {
      const g = s("g", { class: "marker" }, mk);
      s("line", { x1: x(r.index), x2: x(r.index), y1: m.t - 6, y2: m.t + ih }, g);
      if (x(r.index) - lastLabelX < 26 + r.label.length * 4) return; // skip labels that would collide
      lastLabelX = x(r.index);
      const label = s("text", { x: x(r.index), y: m.t - 10, "text-anchor": "middle", class: "marker-label" }, g);
      label.textContent = r.label;
    });

    // area under first series
    const first = opts.series[0];
    const defs = s("defs", {}, svg);
    const gid = "g" + Math.random().toString(36).slice(2, 8);
    const grad = s("linearGradient", { id: gid, x1: 0, x2: 0, y1: 0, y2: 1 }, defs);
    s("stop", { offset: "0%", class: `stop-a ${first.cls}` }, grad);
    s("stop", { offset: "100%", class: `stop-b ${first.cls}` }, grad);
    const pts = (vals) => vals.map((v, i) => (v == null ? null : [x(i), y(v)]));
    const pathD = (p) => {
      let d = "", pen = false;
      p.forEach((pt, i) => {
        if (!pt) { pen = false; return; }
        d += (pen ? "L" : "M") + pt[0].toFixed(1) + "," + pt[1].toFixed(1);
        pen = true;
      });
      return d;
    };
    const fp = pts(first.values).filter(Boolean);
    if (fp.length > 1) {
      const area = s("path", { d: `M${fp[0][0]},${m.t + ih}` + fp.map((p) => `L${p[0]},${p[1]}`).join("") + `L${fp[fp.length - 1][0]},${m.t + ih}Z`, fill: `url(#${gid})`, class: "area" }, svg);
      if (!reduce()) area.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 900, delay: 300, easing: "ease-out", fill: "backwards" });
    }

    const lines = opts.series.map((se, si) => {
      const p = pts(se.values);
      const path = s("path", { d: pathD(p), class: `line ${se.cls}` }, svg);
      if (!reduce()) {
        const len = path.getTotalLength();
        path.style.strokeDasharray = len;
        path.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 1300, delay: si * 140, easing: "cubic-bezier(.22,1,.36,1)", fill: "both" })
          .finished.then(() => (path.style.strokeDasharray = "")).catch(() => {});
      }
      // direct label at line end
      const last = [...p].reverse().find(Boolean);
      if (last) {
        s("circle", { cx: last[0], cy: last[1], r: 4, class: `end-dot ${se.cls}` }, svg);
        const lv = [...se.values].reverse().find((v) => v != null);
        const t = s("text", { x: last[0] + 9, y: last[1] + 4, class: "direct-label" }, svg);
        t.textContent = opts.yFmt(lv);
      }
      return { se, p };
    });
    // nudge overlapping direct labels apart
    const dl = [...svg.querySelectorAll(".direct-label")];
    if (dl.length === 2) {
      const [a, b] = dl, ya = +a.getAttribute("y"), yb = +b.getAttribute("y");
      if (Math.abs(ya - yb) < 14) { const mid = (ya + yb) / 2; a.setAttribute("y", ya <= yb ? mid - 7 : mid + 7); b.setAttribute("y", ya <= yb ? mid + 7 : mid - 7); }
    }

    // hover layer
    const hover = s("g", { class: "hover" }, svg);
    const vline = s("line", { y1: m.t, y2: m.t + ih, class: "crosshair" }, hover);
    const dots = lines.map((l) => s("circle", { r: 5, class: `hover-dot ${l.se.cls}` }, hover));
    const hit = s("rect", { x: m.l, y: 0, width: iw, height: H, fill: "transparent" }, svg);
    const move = (ev) => {
      const bb = svg.getBoundingClientRect();
      const px = ((ev.clientX - bb.left) / bb.width) * W;
      const i = Math.max(0, Math.min(n - 1, Math.round(((px - m.l) / iw) * (n - 1))));
      hover.classList.add("is-on");
      vline.setAttribute("x1", x(i)); vline.setAttribute("x2", x(i));
      lines.forEach((l, k) => {
        const pt = l.p[i];
        dots[k].style.display = pt ? "" : "none";
        if (pt) { dots[k].setAttribute("cx", pt[0]); dots[k].setAttribute("cy", pt[1]); }
      });
      const rel = (opts.markers || []).find((r) => r.index === i);
      tip.show(
        `<div class="tt-title">${fmtDate(opts.dates[i], true)}</div>` +
        lines.map((l) => `<div class="tt-row"><i class="sw ${l.se.cls}"></i>${l.se.name}<b>${l.se.values[i] == null ? "—" : opts.yFmt(l.se.values[i])}</b></div>`).join("") +
        (rel ? `<div class="tt-note">Update ${rel.label} shipped: ${rel.note}</div>` : ""),
        ev.clientX, ev.clientY
      );
    };
    hit.addEventListener("pointermove", move);
    hit.addEventListener("pointerdown", move);
    hit.addEventListener("pointerleave", () => { hover.classList.remove("is-on"); tip.hide(); });
  }

  /* ---------- Stacked columns ---------- */
  // opts: { labels: [str], series: [{ name, cls, values }], fmt }
  function stacked(el, opts) {
    el.innerHTML = "";
    const W = el.clientWidth || 600, H = el.clientHeight || 240;
    const m = { l: 44, r: 8, t: 12, b: 28 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const n = opts.labels.length;
    const totals = opts.labels.map((_, i) => opts.series.reduce((a, se) => a + se.values[i], 0));
    const max = Math.max(1, ...totals);
    const ticks = niceTicks(0, max, 4);
    const top = Math.max(max, ticks[ticks.length - 1]);
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "chart", role: "img", "aria-label": opts.label || "Stacked columns" }, el);
    const y = (v) => m.t + ih - (v / top) * ih;
    const grid = s("g", { class: "grid" }, svg);
    for (const t of ticks) {
      s("line", { x1: m.l, x2: m.l + iw, y1: y(t), y2: y(t) }, grid);
      s("text", { x: m.l - 8, y: y(t) + 4, "text-anchor": "end", class: "tick" }, grid).textContent = opts.fmt(t);
    }
    const slot = iw / n, bw = Math.max(3, Math.min(28, slot * 0.62));
    const every = Math.ceil(n / 6);
    opts.labels.forEach((lab, i) => {
      const cx = m.l + slot * i + slot / 2;
      if (i % every === 0) s("text", { x: cx, y: H - 8, "text-anchor": "middle", class: "tick" }, grid).textContent = lab;
      const g = s("g", { class: "col" }, svg);
      let acc = 0;
      opts.series.forEach((se, k) => {
        const v = se.values[i];
        if (!v) return;
        const y0 = y(acc), y1 = y(acc + v);
        const h = Math.max(0, y0 - y1 - (k > 0 ? 2 : 0)); // 2px surface gap between segments
        const isTop = k === opts.series.length - 1 || opts.series.slice(k + 1).every((o) => !o.values[i]);
        const r = Math.min(4, h, bw / 2);
        const x0 = cx - bw / 2, yy = y1;
        const d = isTop
          ? `M${x0},${yy + h}V${yy + r}Q${x0},${yy} ${x0 + r},${yy}H${x0 + bw - r}Q${x0 + bw},${yy} ${x0 + bw},${yy + r}V${yy + h}Z`
          : `M${x0},${yy}H${x0 + bw}V${yy + h}H${x0}Z`;
        const p = s("path", { d, class: `bar ${se.cls}` }, g);
        if (!reduce()) p.animate([{ transform: "scaleY(0)" }, { transform: "scaleY(1)" }], { duration: 700, delay: 200 + i * (500 / n), easing: "cubic-bezier(.22,1,.36,1)", fill: "backwards" });
        p.style.transformOrigin = `${cx}px ${m.t + ih}px`;
        acc += v;
      });
      const hit = s("rect", { x: cx - slot / 2, y: m.t, width: slot, height: ih, fill: "transparent" }, g);
      const show = (ev) => {
        svg.querySelectorAll(".col").forEach((c) => c.classList.toggle("dim", c !== g));
        tip.show(`<div class="tt-title">${opts.titles ? opts.titles[i] : lab}</div>` +
          opts.series.map((se) => `<div class="tt-row"><i class="sw ${se.cls}"></i>${se.name}<b>${opts.fmt(se.values[i])}</b></div>`).join("") +
          `<div class="tt-row muted">Total<b>${opts.fmt(totals[i])}</b></div>`, ev.clientX, ev.clientY);
      };
      hit.addEventListener("pointermove", show);
      hit.addEventListener("pointerdown", show);
      hit.addEventListener("pointerleave", () => { svg.querySelectorAll(".col").forEach((c) => c.classList.remove("dim")); tip.hide(); });
    });
  }

  /* ---------- Horizontal bars (HTML) ---------- */
  // rows: [{ key, label, emoji, value, display, sub, delta, active }]
  function hbars(el, rows, opts = {}) {
    const max = opts.max || Math.max(...rows.map((r) => r.value), 1e-9);
    el.innerHTML = rows.map((r, i) => `
      <button class="hbar ${r.active ? "is-active" : ""}" data-key="${r.key}" style="--i:${i}" aria-pressed="${!!r.active}">
        <span class="hbar-label">${r.emoji ? E(r.emoji) : ""}${r.label}</span>
        <span class="hbar-track"><span class="hbar-fill ${opts.cls || "s-down"}" style="--w:${(r.value / max) * 100}%"></span></span>
        <span class="hbar-val">${r.display}</span>
        <span class="hbar-delta ${r.delta > 0.0005 ? "worse" : r.delta < -0.0005 ? "better" : ""}">${r.deltaText || ""}</span>
      </button>`).join("");
    el.querySelectorAll(".hbar").forEach((b, i) => {
      const r = rows[i];
      b.addEventListener("pointermove", (ev) => tip.show(`<div class="tt-title">${r.label}</div>${r.tooltip || ""}`, ev.clientX, ev.clientY));
      b.addEventListener("pointerleave", () => tip.hide());
      if (opts.onClick) b.addEventListener("click", () => opts.onClick(r));
    });
    reveal(el);
  }

  /* ---------- Heatmap (HTML grid) ---------- */
  function heatmap(el, rows, cols, matrix, opts = {}) {
    const max = Math.max(1, ...matrix.flat());
    const colHead = cols.map((c) => `<div class="hm-col" title="${c}">${opts.colEmoji && opts.colEmoji[c] ? E(opts.colEmoji[c]) : ""}<span>${c}</span></div>`).join("");
    el.style.setProperty("--cols", cols.length);
    el.innerHTML = `<div class="hm-corner"></div>${colHead}` + rows.map((r, i) =>
      `<div class="hm-row">${r}</div>` + cols.map((c, j) => {
        const v = matrix[i][j], t = v / max;
        return `<div class="hm-cell ${t > 0.55 ? "hm-hot" : ""}" style="--t:${(0.06 + t * 0.94).toFixed(3)};--d:${(i + j) * 18}ms" data-i="${i}" data-j="${j}"><span>${v ? opts.fmt(v) : ""}</span></div>`;
      }).join("")).join("");
    el.querySelectorAll(".hm-cell").forEach((cell) => {
      const i = +cell.dataset.i, j = +cell.dataset.j;
      const colTotal = rows.reduce((a, _, k) => a + matrix[k][j], 0);
      cell.addEventListener("pointermove", (ev) => tip.show(
        `<div class="tt-title">${cols[j]}</div><div class="tt-row">${rows[i]}<b>${opts.fmt(matrix[i][j])}</b></div><div class="tt-row muted">Share of this topic's 👎<b>${colTotal ? Math.round((matrix[i][j] / colTotal) * 100) : 0}%</b></div>`, ev.clientX, ev.clientY));
      cell.addEventListener("pointerleave", () => tip.hide());
    });
    reveal(el);
  }

  /* ---------- Star distribution ---------- */
  function stars(el, counts) {
    const total = counts.reduce((a, b) => a + b, 0) || 1;
    const max = Math.max(...counts, 1);
    el.innerHTML = [5, 4, 3, 2, 1].map((st, k) => {
      const v = counts[st - 1];
      return `<div class="star-row" style="--i:${k}" data-st="${st}"><span class="star-n">${st}★</span><span class="star-track"><span class="star-fill" style="--w:${(v / max) * 100}%"></span></span><span class="star-pct">${Math.round((v / total) * 100)}%</span></div>`;
    }).join("");
    el.querySelectorAll(".star-row").forEach((row) => {
      const st = +row.dataset.st;
      row.addEventListener("pointermove", (ev) => tip.show(`<div class="tt-title">${st}-star ratings</div><div class="tt-row">Count<b>${counts[st - 1].toLocaleString()}</b></div>`, ev.clientX, ev.clientY));
      row.addEventListener("pointerleave", () => tip.hide());
    });
    reveal(el);
  }

  /* ---------- Sparkline ---------- */
  function spark(el, values, cls) {
    el.innerHTML = "";
    const v = values.filter((x) => x != null);
    if (v.length < 2) return;
    const W = 120, H = 34, min = Math.min(...v), max = Math.max(...v), span = max - min || 1;
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "spark", preserveAspectRatio: "none", "aria-hidden": "true" }, el);
    const pts = v.map((x, i) => [(i / (v.length - 1)) * (W - 6) + 1, H - 4 - ((x - min) / span) * (H - 8)]);
    const p = s("path", { d: "M" + pts.map((q) => q.map((n) => n.toFixed(1)).join(",")).join("L"), class: `line ${cls}`, "vector-effect": "non-scaling-stroke" }, svg);
    const last = pts[pts.length - 1];
    s("circle", { cx: last[0], cy: last[1], r: 2.5, class: `end-dot ${cls}` }, svg);
    if (!reduce()) {
      const len = p.getTotalLength();
      p.style.strokeDasharray = len;
      p.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 1100, delay: 250, easing: "cubic-bezier(.22,1,.36,1)", fill: "both" })
        .finished.then(() => (p.style.strokeDasharray = "")).catch(() => {});
    }
  }

  window.PHCharts = { line, stacked, hbars, heatmap, stars, spark, tip, fmtDate };
})();
