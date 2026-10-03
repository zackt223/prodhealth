/*!
 * #prodhealth — Data layer: demo dataset generator + importer for your own feedback events.
 * Copyright (c) 2026 Zackariah Telsem — MIT License
 *
 * Every view renders from one shape:
 *   { days: [{ date, topics: { [topic]: { up, down, reasons: { [reason]: n } } }, stars: [1★..5★], quality }],
 *     topics, reasons, releases: [{ date, version, note }], feed: [event], source }
 */
(function () {
  const DAY = 864e5;
  const TOPICS = ["Code help", "Search & facts", "Summaries", "Writing", "Billing & account", "Math", "Travel planning"];
  const REASONS = ["Incorrect / made up", "Ignored instructions", "Too long", "Outdated info", "Wrongly refused", "Bad formatting", "Off-tone"];
  const TOPIC_EMOJI = { "Code help": "💻", "Search & facts": "🔎", "Summaries": "📝", "Writing": "✍️", "Billing & account": "💳", "Math": "🧮", "Travel planning": "🧳" };

  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const dayKey = (d) => new Date(d).toISOString().slice(0, 10);

  /* ---------------- Demo dataset ---------------- */
  function demo(days = 120) {
    const r = rng(2027);
    const gauss = () => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const pick = (weights) => { const tot = Object.values(weights).reduce((a, b) => a + b, 0); let x = r() * tot; for (const k in weights) { x -= weights[k]; if (x <= 0) return k; } return Object.keys(weights)[0]; };

    const end = new Date(); end.setHours(12, 0, 0, 0);
    const start = new Date(end.getTime() - (days - 1) * DAY);
    const at = (i) => new Date(start.getTime() + i * DAY);

    const releases = [
      { day: 6, version: "v2.1", note: "Faster first token" },
      { day: 33, version: "v2.2", note: "New summarizer prompt" },
      { day: 60, version: "v2.3", note: "Base model swap" },
      { day: 68, version: "v2.3.1", note: "Hotfix for math & code" },
      { day: 91, version: "v2.4", note: "Retrieval upgrade" }
    ].filter((x) => x.day < days).map((x) => ({ ...x, date: at(x.day) }));

    const volume = { "Code help": 120, "Search & facts": 105, "Summaries": 88, "Writing": 76, "Billing & account": 58, "Math": 44, "Travel planning": 40 };
    const baseRate = { "Code help": 0.15, "Search & facts": 0.17, "Summaries": 0.11, "Writing": 0.09, "Billing & account": 0.21, "Math": 0.18, "Travel planning": 0.14 };
    const reasonBase = {
      "Code help": { "Incorrect / made up": 5, "Ignored instructions": 3, "Too long": 2, "Outdated info": 2, "Wrongly refused": 1, "Bad formatting": 3, "Off-tone": 0.3 },
      "Search & facts": { "Incorrect / made up": 6, "Ignored instructions": 1, "Too long": 2, "Outdated info": 4, "Wrongly refused": 1, "Bad formatting": 0.5, "Off-tone": 0.3 },
      "Summaries": { "Incorrect / made up": 3, "Ignored instructions": 3, "Too long": 5, "Outdated info": 0.3, "Wrongly refused": 0.5, "Bad formatting": 1.5, "Off-tone": 0.5 },
      "Writing": { "Incorrect / made up": 1, "Ignored instructions": 4, "Too long": 3, "Outdated info": 0.2, "Wrongly refused": 1.5, "Bad formatting": 1, "Off-tone": 3 },
      "Billing & account": { "Incorrect / made up": 4, "Ignored instructions": 2, "Too long": 1, "Outdated info": 2, "Wrongly refused": 2, "Bad formatting": 0.5, "Off-tone": 4 },
      "Math": { "Incorrect / made up": 7, "Ignored instructions": 2, "Too long": 1.5, "Outdated info": 0.1, "Wrongly refused": 0.3, "Bad formatting": 2, "Off-tone": 0.2 },
      "Travel planning": { "Incorrect / made up": 3, "Ignored instructions": 2, "Too long": 2, "Outdated info": 3, "Wrongly refused": 0.5, "Bad formatting": 1, "Off-tone": 0.5 }
    };

    function effect(d, topic) {
      let e = -0.025 * (d / days);
      const reasons = {};
      if (d >= 60 && d < 68) {
        e += topic === "Math" ? 0.21 : topic === "Code help" ? 0.12 : 0.025;
        if (topic === "Math" || topic === "Code help") reasons["Incorrect / made up"] = 9;
      } else if (d >= 68 && d < 91) {
        const fade = 1 - (d - 68) / 23;
        e += (topic === "Math" ? 0.07 : topic === "Code help" ? 0.035 : 0.008) * fade;
        if (topic === "Math") reasons["Incorrect / made up"] = 4 * fade;
      }
      if (d >= 91) {
        e -= 0.015;
        if (topic === "Search & facts") { e -= 0.045; reasons["Outdated info"] = -3; }
      }
      if (d >= 33 && topic === "Summaries") { e -= 0.02; reasons["Too long"] = -2; }
      if (topic === "Travel planning" && d >= days - 16) {
        const ramp = (d - (days - 16)) / 15;
        e += 0.15 * ramp;
        reasons["Outdated info"] = 14 * ramp;
      }
      if (topic === "Billing & account" && d >= days - 12) { e -= 0.05; reasons["Off-tone"] = -3; }
      return { e, reasons };
    }

    const out = [];
    for (let d = 0; d < days; d++) {
      const date = at(d);
      const wk = [0, 6].includes(date.getDay()) ? 0.72 : 1;
      const growth = 1 + d / 200;
      const day = { date, topics: {}, stars: [0, 0, 0, 0, 0], quality: 0 };
      let totalN = 0, totalDown = 0;
      for (const t of TOPICS) {
        const n = Math.round(volume[t] * wk * growth * (0.85 + 0.3 * r()));
        const { e, reasons: rShift } = effect(d, t);
        const p = clamp(baseRate[t] + e + gauss() * 0.012, 0.02, 0.6);
        const down = clamp(Math.round(n * p + gauss() * Math.sqrt(n * p * (1 - p))), 0, n);
        const w = {};
        for (const k of REASONS) w[k] = Math.max(0.05, reasonBase[t][k] + (rShift[k] || 0));
        const reasons = {}; REASONS.forEach((k) => (reasons[k] = 0));
        for (let i = 0; i < down; i++) reasons[pick(w)]++;
        day.topics[t] = { up: n - down, down, reasons };
        totalN += n; totalDown += down;
        // ~22% of people also leave a 1–5 star rating
        const raters = Math.round(n * 0.22);
        for (let i = 0; i < raters; i++) {
          const bad = r() < p * 1.15;
          const s = bad ? (r() < 0.55 ? 1 : r() < 0.6 ? 2 : 3) : (r() < 0.68 ? 5 : r() < 0.75 ? 4 : 3);
          day.stars[s - 1]++;
        }
      }
      const rate = totalDown / totalN;
      day.quality = clamp(100 - rate * 82 + gauss() * 1.1 + (d >= 91 ? 1.2 : 0), 0, 100);
      out.push(day);
    }

    const feed = demoFeed(out, releases, r, pick);
    return { days: out, topics: TOPICS.slice(), reasons: REASONS.slice(), releases, feed, source: "demo" };
  }

  const COMMENTS = {
    "Incorrect / made up": [
      "It cited a function that doesn't exist in the library.",
      "Confidently wrong. The number it gave was off by a factor of ten.",
      "Made up a source. The link 404s and the paper isn't real.",
      "Gave me a formula that's just wrong — checked it by hand.",
      "The answer contradicts what it said two messages earlier."
    ],
    "Ignored instructions": [
      "I said no bullet points. It gave me bullet points.",
      "Asked for TypeScript, got JavaScript.",
      "I asked for 3 options and it gave me 7.",
      "Told it to keep my tone. It rewrote everything in corporate speak."
    ],
    "Too long": [
      "I wanted a one-liner, not an essay.",
      "Way too verbose. The actual answer was buried in paragraph four.",
      "Three paragraphs of preamble before the answer."
    ],
    "Outdated info": [
      "Those visa rules changed this year.",
      "The flight route it suggested was discontinued.",
      "It's quoting last year's prices.",
      "This API was deprecated a while ago.",
      "The museum hours it gave are from before the renovation."
    ],
    "Wrongly refused": [
      "Refused to help me write a villain's dialogue for my novel?",
      "It wouldn't explain how a common medication works. That's literally on the label.",
      "Said it can't help with 'killing' a process. It's a terminal command."
    ],
    "Bad formatting": [
      "The table came out as a mess of pipes.",
      "Code block wasn't closed so everything after it broke.",
      "The JSON had a trailing comma and my parser choked."
    ],
    "Off-tone": [
      "Felt dismissive when I was already frustrated.",
      "Way too cheerful for a billing problem.",
      "It lectured me instead of answering."
    ],
    positive: [
      "Exactly what I needed, thank you!",
      "Saved me an hour of debugging.",
      "Clear, short, correct. Perfect.",
      "Love that it asked a clarifying question first.",
      "The summary nailed the key points.",
      "Way better than last week."
    ]
  };
  const PROMPTS = {
    "Code help": ["Why does my useEffect run twice?", "Convert this Python loop to a list comprehension", "Fix this SQL join returning duplicates", "Write a regex for UK postcodes"],
    "Search & facts": ["When did the Eurostar start?", "How tall is the Burj Khalifa?", "Who invented the QR code?", "What's the population of Lisbon?"],
    "Summaries": ["Summarize this 12-page PDF", "TL;DR this meeting transcript", "Key takeaways from this article"],
    "Writing": ["Make this email sound friendlier", "Rewrite my LinkedIn headline", "Draft a toast for my sister's wedding"],
    "Billing & account": ["Why was I charged twice?", "How do I cancel my plan?", "Change the card on file"],
    "Math": ["What's 15% tip on $86.40?", "Solve 3x + 7 = 22", "Compound interest on $5k at 4% for 6 years"],
    "Travel planning": ["3-day Kyoto itinerary", "Do I need a visa for Vietnam?", "Cheapest way from Rome to Florence"]
  };

  function demoFeed(days, releases, r, pick) {
    const feed = [];
    let id = 1;
    days.forEach((day, d) => {
      const version = [...releases].reverse().find((x) => x.date <= day.date)?.version || "v2.0";
      const count = 2 + Math.floor(r() * 3);
      for (let i = 0; i < count; i++) {
        const vols = {}; for (const t in day.topics) vols[t] = day.topics[t].up + day.topics[t].down;
        const topic = pick(vols);
        const tt = day.topics[topic];
        const downShare = (tt.down / (tt.up + tt.down)) * 3.2;
        const isDown = r() < downShare;
        let reason = null, comment;
        if (isDown) {
          const w = {}; for (const k in tt.reasons) w[k] = tt.reasons[k] + 0.01;
          reason = pick(w);
          const pool = COMMENTS[reason];
          comment = pool[Math.floor(r() * pool.length)];
        } else comment = COMMENTS.positive[Math.floor(r() * COMMENTS.positive.length)];
        let ts = new Date(day.date.getTime() - 12 * 36e5 + r() * DAY);
        if (ts > Date.now()) ts = new Date(Date.now() - r() * 6 * 36e5);
        const ps = PROMPTS[topic];
        feed.push({
          id: id++, ts, thumb: isDown ? "down" : "up",
          stars: r() < 0.4 ? (isDown ? 1 + Math.floor(r() * 2) : 4 + Math.round(r())) : null,
          topic, reason, comment, prompt: ps[Math.floor(r() * ps.length)], version
        });
      }
    });
    return feed.sort((a, b) => b.ts - a.ts);
  }

  /* ---------------- Import ---------------- */
  function parseCSV(text) {
    const rows = []; let row = [], cell = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') q = false;
        else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); cell = ""; if (row.some((c) => c !== "")) rows.push(row); row = [];
      } else cell += ch;
    }
    row.push(cell); if (row.some((c) => c !== "")) rows.push(row);
    const head = rows.shift().map((h) => h.trim().toLowerCase());
    return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? "").trim()])));
  }

  function normThumb(v) {
    const s = String(v ?? "").trim().toLowerCase();
    if (["up", "👍", "1", "true", "positive", "good", "thumbs_up", "yes"].includes(s)) return "up";
    if (["down", "👎", "0", "-1", "false", "negative", "bad", "thumbs_down", "no"].includes(s)) return "down";
    return null;
  }

  /** events: [{ timestamp, thumb|rating, stars?, topic?, reason?, comment?, prompt?, version?, quality? }] */
  function fromEvents(events) {
    const map = new Map(), topics = new Set(), reasons = new Set(), versions = new Map();
    const feed = [];
    let id = 1;
    for (const e of events) {
      const ts = new Date(e.timestamp || e.ts || e.date || e.created_at);
      if (isNaN(ts)) continue;
      const stars = e.stars != null && e.stars !== "" ? clamp(Math.round(Number(e.stars)), 1, 5) : null;
      let thumb = normThumb(e.thumb ?? e.rating ?? e.feedback);
      if (!thumb && stars) thumb = stars >= 4 ? "up" : stars <= 2 ? "down" : null;
      const topic = e.topic || e.feature || e.intent || "General";
      const reason = thumb === "down" ? (e.reason || e.category || "Unlabeled") : null;
      topics.add(topic); if (reason) reasons.add(reason);
      const k = dayKey(ts);
      if (!map.has(k)) map.set(k, { date: new Date(k + "T12:00:00"), topics: {}, stars: [0, 0, 0, 0, 0], qSum: 0, qN: 0 });
      const day = map.get(k);
      const t = (day.topics[topic] ||= { up: 0, down: 0, reasons: {} });
      if (thumb === "up") t.up++;
      if (thumb === "down") { t.down++; t.reasons[reason] = (t.reasons[reason] || 0) + 1; }
      if (stars) day.stars[stars - 1]++;
      const q = Number(e.quality ?? e.quality_score);
      if (e.quality != null && e.quality !== "" && !isNaN(q)) { day.qSum += q <= 1 ? q * 100 : q; day.qN++; }
      if (e.version && (!versions.has(e.version) || versions.get(e.version) > ts)) versions.set(e.version, ts);
      if (e.comment || e.text) feed.push({ id: id++, ts, thumb: thumb || "up", stars, topic, reason, comment: e.comment || e.text, prompt: e.prompt || e.question || "", version: e.version || "" });
    }
    if (!map.size) throw new Error("No rows with a valid timestamp were found.");
    const keys = [...map.keys()].sort();
    // fill gaps so time series are continuous
    const days = [];
    for (let t = new Date(keys[0] + "T12:00:00").getTime(); t <= new Date(keys[keys.length - 1] + "T12:00:00").getTime(); t += DAY) {
      const k = dayKey(t);
      const d = map.get(k) || { date: new Date(k + "T12:00:00"), topics: {}, stars: [0, 0, 0, 0, 0], qSum: 0, qN: 0 };
      d.quality = d.qN ? d.qSum / d.qN : null;
      delete d.qSum; delete d.qN;
      days.push(d);
    }
    const allTopics = [...topics], allReasons = [...reasons];
    for (const d of days) for (const t of allTopics) {
      const tt = (d.topics[t] ||= { up: 0, down: 0, reasons: {} });
      for (const r of allReasons) tt.reasons[r] ||= 0;
    }
    const releases = [...versions.entries()].sort((a, b) => a[1] - b[1]).slice(1).map(([version, date]) => ({ version, date, note: "First seen in feedback" }));
    return { days, topics: allTopics, reasons: allReasons, releases, feed: feed.sort((a, b) => b.ts - a.ts), source: "imported" };
  }

  function parseFile(name, text) {
    let events;
    if (/\.json$/i.test(name) || /^\s*[\[{]/.test(text)) {
      const j = JSON.parse(text);
      events = Array.isArray(j) ? j : j.events || j.feedback || j.data;
      if (!Array.isArray(events)) throw new Error("JSON must be an array of events (or { events: [...] }).");
    } else events = parseCSV(text);
    return fromEvents(events);
  }

  window.PHData = { demo, parseFile, fromEvents, TOPIC_EMOJI, DAY, dayKey };
})();
