/*!
 * #prodhealth — Grader
 * Deterministic, dependency-free assertions. The same file runs in the browser dashboard and in CI (Node).
 * Copyright (c) 2026 Zackariah Telsem — MIT License
 */
(function (root) {
  const REFUSAL = /\b(i\s*can(?:'|’)?t|i\s*cannot|i\s*won(?:'|’)t|i(?:'|’)m not able to|i am not able to|unable to (?:help|assist|provide)|not able to help|i must decline|i(?:'|’)m sorry,? but i)\b/i;
  const lower = (s) => String(s == null ? "" : s).toLowerCase();
  const list = (v) => (Array.isArray(v) ? v : [v]);
  const words = (s) => String(s).trim().split(/\s+/).filter(Boolean).length;

  const CHECKS = {
    contains(r, v) {
      const miss = list(v).filter((x) => !lower(r).includes(lower(x)));
      return { pass: !miss.length, detail: miss.length ? `Missing: ${miss.join(", ")}` : "All present" };
    },
    containsAny(r, v) {
      const hit = list(v).find((x) => lower(r).includes(lower(x)));
      return { pass: !!hit, detail: hit ? `Found “${hit}”` : `None of the ${list(v).length} expected phrases found` };
    },
    notContains(r, v) {
      const hit = list(v).filter((x) => lower(r).includes(lower(x)));
      return { pass: !hit.length, detail: hit.length ? `Found forbidden: ${hit.join(", ")}` : "None found" };
    },
    regex(r, v, c) {
      const ok = new RegExp(v, c.flags || "i").test(String(r));
      return { pass: ok, detail: ok ? "Matched" : `No match for /${v}/` };
    },
    notRegex(r, v, c) {
      const m = String(r).match(new RegExp(v, c.flags || "i"));
      return { pass: !m, detail: m ? `Matched “${m[0].slice(0, 60)}”` : "No match" };
    },
    maxWords(r, v) {
      const n = words(r);
      return { pass: n <= v, detail: `${n} words (max ${v})` };
    },
    minWords(r, v) {
      const n = words(r);
      return { pass: n >= v, detail: `${n} words (min ${v})` };
    },
    refuses(r, v) {
      const did = REFUSAL.test(String(r));
      return { pass: did === !!v, detail: did ? "Response refuses" : "Response complies" };
    },
    json(r) {
      try { JSON.parse(String(r).trim()); return { pass: true, detail: "Valid JSON" }; }
      catch (e) { return { pass: false, detail: "Not valid JSON" }; }
    },
    bullets(r, v) {
      const n = String(r).split(/\r?\n/).filter((l) => /^\s*(?:[-•*]|\d+[.)])\s+\S/.test(l)).length;
      return { pass: n === v, detail: `${n} bullets (want ${v})` };
    }
  };

  function describe(c) {
    if (c.label) return c.label;
    const v = Array.isArray(c.value) ? c.value.map((x) => `“${x}”`).join(", ") : c.value;
    switch (c.type) {
      case "contains": return `Contains ${v}`;
      case "containsAny": return `Mentions any of ${v}`;
      case "notContains": return `Never says ${v}`;
      case "regex": return `Matches /${c.value}/`;
      case "notRegex": return `Doesn't match /${c.value}/`;
      case "maxWords": return `At most ${c.value} words`;
      case "minWords": return `At least ${c.value} words`;
      case "refuses": return c.value ? "Refuses the request" : "Doesn't refuse";
      case "json": return "Valid JSON only";
      case "bullets": return `Exactly ${c.value} bullet points`;
      default: return c.type;
    }
  }

  function grade(testCase, response) {
    const missing = response == null;
    const results = testCase.checks.map((c) => {
      const fn = CHECKS[c.type];
      if (missing) return { type: c.type, label: describe(c), pass: false, detail: "No response" };
      if (!fn) return { type: c.type, label: describe(c), pass: false, detail: `Unknown check “${c.type}”` };
      return Object.assign({ type: c.type, label: describe(c) }, fn(response, c.value, c));
    });
    return { id: testCase.id, pass: !missing && results.every((r) => r.pass), missing, results };
  }

  /**
   * Compare a candidate run against a baseline run.
   * runs: { [caseId]: responseText }
   */
  function compare(cases, baselineRun, candidateRun, opts) {
    const minPass = (opts && opts.minPass) != null ? opts.minPass : 0.9;
    const rows = cases.map((c) => {
      const b = baselineRun ? grade(c, baselineRun[c.id]) : null;
      const k = grade(c, candidateRun[c.id]);
      let change = "same";
      if (b && b.pass && !k.pass) change = "regression";
      else if (b && !b.pass && k.pass) change = "fixed";
      return { case: c, baseline: b, candidate: k, change };
    });
    const graded = rows.filter((r) => !r.candidate.missing);
    const passed = graded.filter((r) => r.candidate.pass).length;
    const basePassed = rows.filter((r) => r.baseline && r.baseline.pass).length;
    const regressions = rows.filter((r) => r.change === "regression");
    const fixes = rows.filter((r) => r.change === "fixed");
    const criticalFails = rows.filter((r) => !r.candidate.pass && r.case.severity === "critical");
    const passRate = graded.length ? passed / graded.length : 0;

    let verdict = "ship", reason = "All critical cases pass and nothing regressed.";
    if (criticalFails.length) { verdict = "block"; reason = `${criticalFails.length} critical case${criticalFails.length > 1 ? "s" : ""} failing.`; }
    else if (regressions.length) { verdict = "block"; reason = `${regressions.length} regression${regressions.length > 1 ? "s" : ""} vs. baseline.`; }
    else if (passRate < minPass) { verdict = "caution"; reason = `Pass rate ${(passRate * 100).toFixed(0)}% is under the ${(minPass * 100).toFixed(0)}% bar.`; }

    return {
      rows, passed, total: graded.length, passRate,
      baselinePassRate: baselineRun ? basePassed / cases.length : null,
      regressions, fixes, criticalFails, verdict, reason
    };
  }

  root.ProdHealthGrader = { grade, compare, describe, CHECKS, REFUSAL };
})(typeof globalThis !== "undefined" ? globalThis : window);
