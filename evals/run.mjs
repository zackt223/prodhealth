#!/usr/bin/env node
/*!
 * #prodhealth — Release gate CLI
 * Runs the edge-case suite against a model, compares with a baseline, and exits non-zero if the release should be blocked.
 * Copyright (c) 2026 Zackariah Telsem — MIT License
 *
 * Usage
 *   node evals/run.mjs --mock candidate                      # demo: grade the bundled sample responses
 *   node evals/run.mjs --endpoint <url> --model <name> \
 *        --baseline evals/results/baseline.json --out evals/results/candidate.json
 *
 * Options
 *   --endpoint   OpenAI-compatible /chat/completions URL. API key is read from PRODHEALTH_API_KEY.
 *   --model      Model name sent in the request body.
 *   --system     Path to a text file used as the system prompt (optional).
 *   --baseline   Previous results file to compare against (optional).
 *   --out        Where to save this run's results (load it in the dashboard with "Load run").
 *   --min-pass   Minimum pass rate, 0–1 (default 0.9).
 *   --only       Comma-separated case ids or categories to run.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
await import(pathToFileURL(join(here, "cases.js")).href);
await import(pathToFileURL(join(here, "grader.js")).href);
const { PRODHEALTH_CASES: ALL_CASES, PRODHEALTH_CATEGORIES: CATS, ProdHealthGrader: G } = globalThis;

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith("--")) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith("--") ? arr[i + 1] : true]);
    return acc;
  }, [])
);

const only = typeof args.only === "string" ? args.only.split(",") : null;
const cases = only ? ALL_CASES.filter((c) => only.includes(c.id) || only.includes(c.category)) : ALL_CASES;
const minPass = args["min-pass"] ? Number(args["min-pass"]) : 0.9;
const c = (n, s) => (process.stdout.isTTY ? `\x1b[${n}m${s}\x1b[0m` : s);

async function callModel(prompt, system) {
  const messages = system ? [{ role: "system", content: system }, { role: "user", content: prompt }] : [{ role: "user", content: prompt }];
  const res = await fetch(args.endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.PRODHEALTH_API_KEY || ""}` },
    body: JSON.stringify({ model: args.model, messages, temperature: 0 })
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? data.content?.[0]?.text ?? "";
}

async function loadRun(path) {
  const run = JSON.parse(await readFile(path, "utf8"));
  return run.responses || run;
}

let responses = {}, label;
if (args.mock) {
  const which = args.mock === true ? "candidate" : args.mock;
  label = `demo-${which}`;
  for (const k of cases) responses[k.id] = k.demo?.[which];
} else if (args.endpoint) {
  label = args.model || "candidate";
  const system = args.system ? await readFile(args.system, "utf8") : null;
  for (const k of cases) {
    process.stdout.write(c(2, `  running ${k.id}…\r`));
    try { responses[k.id] = await callModel(k.prompt, system); }
    catch (e) { console.error(c(31, `\n  ${k.id} failed: ${e.message}`)); responses[k.id] = null; }
  }
} else {
  console.log("Pass --mock candidate to try the demo, or --endpoint <url> --model <name> to test a real model.");
  process.exit(2);
}

let baseline = null;
if (args.baseline) baseline = await loadRun(args.baseline);
else if (args.mock) baseline = Object.fromEntries(cases.map((k) => [k.id, k.demo?.baseline]));

const report = G.compare(cases, baseline, responses, { minPass });

console.log("\n" + c(1, "#prodhealth · edge-case suite") + c(2, `  ${label} · ${cases.length} cases\n`));
let lastCat = null;
for (const r of report.rows) {
  if (r.case.category !== lastCat) {
    lastCat = r.case.category;
    console.log(c(2, `  ${CATS[lastCat]?.emoji || "•"} ${CATS[lastCat]?.label || lastCat}`));
  }
  const icon = r.candidate.pass ? c(32, "✔") : c(31, "✘");
  const tag = r.change === "regression" ? c(31, " REGRESSION") : r.change === "fixed" ? c(32, " FIXED") : "";
  const sev = r.case.severity === "critical" ? c(35, " [critical]") : "";
  console.log(`    ${icon} ${r.case.id.padEnd(8)} ${r.case.title}${sev}${tag}`);
  if (!r.candidate.pass) for (const f of r.candidate.results.filter((x) => !x.pass)) console.log(c(2, `        ↳ ${f.label}: ${f.detail}`));
}

const pct = (x) => `${(x * 100).toFixed(0)}%`;
console.log(
  `\n  Pass rate ${c(1, pct(report.passRate))}` +
  (report.baselinePassRate != null ? c(2, ` (baseline ${pct(report.baselinePassRate)})`) : "") +
  `  ·  ${report.regressions.length} regressions  ·  ${report.fixes.length} fixed  ·  ${report.criticalFails.length} critical failing`
);
const verdictText = { ship: c(42, " READY TO SHIP "), caution: c(43, " SHIP WITH CAUTION "), block: c(41, " BLOCKED ") }[report.verdict];
console.log(`  ${verdictText} ${report.reason}\n`);

if (args.out) {
  await mkdir(dirname(args.out), { recursive: true });
  await writeFile(args.out, JSON.stringify({ label, model: args.model || null, createdAt: new Date().toISOString(), responses }, null, 2));
  console.log(c(2, `  Saved run → ${args.out} (load it in the dashboard with “Load run”)\n`));
}

process.exit(report.verdict === "block" ? 1 : 0);
