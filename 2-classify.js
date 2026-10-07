// 2-classify.js — what each job title actually is.
//
// A typed title becomes a standard occupation, with a first-pass judgement for each
// program. Three rules keep it honest:
//   1. It is conservative. "Not eligible" only when the title clearly names an occupation
//      that is off the list. Anything vague — Owner, Manager, Technician — is "unclear",
//      because HOF's own criteria say to assess duties rather than reject on a title.
//   2. Each title is read once, ever. Results are kept in cache/titles.json, so later runs
//      only read new titles, and a run that hits the quota carries on next time.
//   3. HOF has the last word. Anything in occupation-decisions.csv overrides the reader.
//
// Only the titles are sent — no names, numbers or emails.
const fs = require("fs");
const { SETTINGS } = require("./config");

const keys = [process.env.GEMINI_KEY, process.env.GEMINI_KEY_2].filter(Boolean);
let turn = 0, MODEL = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const V3 = ["eligible", "not_eligible", "unclear"];
const VUS = ["plausible", "unlikely", "unclear"];
const KINDS = ["occupation", "no_occupation", "unclear", "junk"];

function loadCache() {
  try { return JSON.parse(fs.readFileSync(SETTINGS.CACHE_FILE, "utf8")); } catch { return {}; }
}
function saveCache(cache) {
  fs.mkdirSync(require("path").dirname(SETTINGS.CACHE_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS.CACHE_FILE, JSON.stringify(cache));
}

// ---- HOF's own decisions ----
function parseCsvLine(line) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ",") { out.push(cur); cur = ""; } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}
function decisionValue(v, us) {
  const t = String(v || "").toLowerCase().trim().replace(/\s+/g, " ");
  if (!t) return null;
  if (/^(eligible|yes|y|ok|can|plausible)$/.test(t)) return us ? "plausible" : "eligible";
  if (/^(not eligible|not_eligible|no|n|cannot|can't|unlikely|ineligible)$/.test(t)) return us ? "unlikely" : "not_eligible";
  if (/^(unclear|assess|needs assessment|check)$/.test(t)) return "unclear";
  return null;
}
function loadDecisions(text) {
  const src = text != null ? text : (fs.existsSync(SETTINGS.DECISIONS_FILE) ? fs.readFileSync(SETTINGS.DECISIONS_FILE, "utf8") : "");
  const map = new Map();
  src.split(/\r?\n/).slice(1).forEach((line) => {
    if (!line.trim()) return;
    const [title, au, ca, us, note] = parseCsvLine(line);
    const key = String(title || "").toLowerCase().trim().replace(/\s+/g, " ");
    if (!key) return;
    map.set(key, { au: decisionValue(au), ca: decisionValue(ca), us: decisionValue(us, true), note: note || "" });
  });
  return map;
}
// a title-level decision beats an occupation-level one, which beats the reader
function applyDecisions(title, cls, decisions) {
  const d = decisions.get(title) || (cls && cls.occupation ? decisions.get(String(cls.occupation).toLowerCase()) : null);
  if (!d) return { ...cls, decided: false };
  return {
    ...cls,
    au: d.au || cls.au, ca: d.ca || cls.ca, us: d.us || cls.us,
    why: d.note ? `HOF decision: ${d.note}` : `HOF decision${cls.why ? ` (reader said: ${cls.why})` : ""}`,
    decided: true,
  };
}

// ---- the reader ----
async function pickModel() {
  if (MODEL) return MODEL;
  try {
    const d = await (await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${keys[0]}`)).json();
    const list = (d.models || []).filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map((m) => String(m.name).replace(/^models\//, ""))
      .filter((n) => !/image|tts|live|embed|aqa|native-audio|dialog|computer-use|robotics/i.test(n));
    for (const w of SETTINGS.AI_MODELS) { MODEL = list.find((n) => n === w) || list.find((n) => n.startsWith(w)); if (MODEL) break; }
    MODEL = MODEL || list.find((n) => /flash/i.test(n)) || SETTINGS.AI_MODELS[0];
  } catch { MODEL = SETTINGS.AI_MODELS[0]; }
  return MODEL;
}

const PROMPT = (titles) => `You classify job titles typed by people enquiring about skilled migration. Most are in the Gulf; titles may be misspelled, abbreviated, or in Arabic, Urdu or other languages. Read each as an experienced immigration consultant would.

For each title decide:
- occupation: the standard occupation it most likely names, in English. "" if it names none.
- anzsco: the 6-digit ANZSCO code if confident, else "".
- noc: the 5-digit NOC 2021 code if confident, else "".
- teer: the NOC TEER (0-5) if confident, else null.
- kind: "occupation" (a real job), "no_occupation" (student, housewife, unemployed, retired, jobless),
        "unclear" (too vague to identify: owner, manager, technician, supervisor, agent, officer, staff, worker, business, job, employee),
        or "junk" (gibberish, a greeting, a single letter, a name, a company name).
- au: could this occupation be on Australia's skilled lists for subclass 189, 190 or 491 (MLTSSL, STSOL or ROL)?
      "eligible", "not_eligible", or "unclear".
- ca: is it NOC TEER 0, 1, 2 or 3 (eligible for Express Entry / PNP)? "eligible"; TEER 4 or 5 is "not_eligible"; otherwise "unclear".
- us: for USA EB-2 NIW, is it a professional or specialty occupation that could support an endeavour of national importance?
      "plausible", "unlikely" (clearly manual or unskilled work), or "unclear".
- why: under 12 words.

Be conservative. Use "not_eligible" or "unlikely" ONLY when the title clearly names a specific occupation that fails.
If the title is vague, judge "unclear" — never guess the duties. Non-occupations and junk are "unclear" for every program.

Titles:
${titles.map((t, i) => `${i}. ${t}`).join("\n")}

Reply ONLY with a JSON array, one object per title, in order:
[{"i":0,"occupation":"","anzsco":"","noc":"","teer":null,"kind":"occupation","au":"unclear","ca":"unclear","us":"unclear","why":""}]`;

function tidy(o) {
  const kind = KINDS.includes(o && o.kind) ? o.kind : "unclear";
  const forced = kind !== "occupation";      // a non-occupation is never judged eligible or not
  const pick = (v, allowed) => (forced ? "unclear" : allowed.includes(v) ? v : "unclear");
  const teer = Number.isInteger(o && o.teer) && o.teer >= 0 && o.teer <= 5 ? o.teer : null;
  return {
    occupation: String((o && o.occupation) || "").slice(0, 80), anzsco: String((o && o.anzsco) || "").replace(/\D/g, "").slice(0, 6),
    noc: String((o && o.noc) || "").replace(/\D/g, "").slice(0, 5), teer, kind,
    au: pick(o && o.au, V3), ca: pick(o && o.ca, V3), us: pick(o && o.us, VUS),
    why: String((o && o.why) || "").slice(0, 120),
  };
}

async function askBatch(titles, attempt = 0) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${await pickModel()}:generateContent?key=${keys[(turn++) % keys.length]}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: PROMPT(titles) }] }], generationConfig: { temperature: 0, responseMimeType: "application/json" } }),
  });
  const d = await res.json();
  if (d.error) {
    if (/quota|RESOURCE_EXHAUSTED|429|rate/i.test(d.error.message || "") && attempt < 4) { await sleep(20000 * (attempt + 1)); return askBatch(titles, attempt + 1); }
    const e = new Error(d.error.message || "the reader failed"); e.quota = /quota|RESOURCE_EXHAUSTED/i.test(d.error.message || ""); throw e;
  }
  const t = (d.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  const m = t.match(/\[[\s\S]*\]/);
  if (!m) throw new Error("unreadable answer");
  const arr = JSON.parse(m[0]);
  const out = new Array(titles.length).fill(null);
  for (const o of arr) { const i = Number(o && o.i); if (Number.isInteger(i) && i >= 0 && i < titles.length) out[i] = tidy(o); }
  return out;
}

// titles: Map<title, count>. Most frequent first, so a short run still covers most leads.
async function classifyAll(titles, cache, log = console.log) {
  const todo = [...titles.entries()].filter(([t]) => !cache[t]).sort((a, b) => b[1] - a[1]).map(([t]) => t);
  const stats = { cached: titles.size - todo.length, read: 0, left: 0, requests: 0, stopped: "" };
  if (!todo.length) return stats;
  if (!keys.length) { stats.left = todo.length; stats.stopped = "no GEMINI_KEY"; return stats; }
  log(`  ${todo.length} new job title(s) to read, ${stats.cached} already known`);
  for (let i = 0; i < todo.length; i += SETTINGS.TITLES_PER_REQUEST) {
    if (stats.requests >= SETTINGS.MAX_AI_REQUESTS) { stats.stopped = `the limit of ${SETTINGS.MAX_AI_REQUESTS} requests for one run`; break; }
    const batch = todo.slice(i, i + SETTINGS.TITLES_PER_REQUEST);
    try {
      stats.requests++;
      const res = await askBatch(batch);
      batch.forEach((t, k) => { if (res[k]) { cache[t] = { ...res[k], at: new Date().toISOString().slice(0, 10) }; stats.read++; } });
      if (stats.requests % 10 === 0) { saveCache(cache); log(`    ${stats.read} titles read so far`); }
    } catch (e) {
      log(`    a batch failed: ${String(e.message).slice(0, 90)}`);
      if (e.quota) { stats.stopped = "the Gemini quota"; break; }
    }
  }
  saveCache(cache);
  stats.left = todo.filter((t) => !cache[t]).length;
  return stats;
}

const UNREAD = { occupation: "", anzsco: "", noc: "", teer: null, kind: "unclear", au: "unclear", ca: "unclear", us: "unclear", why: "Not read yet — will be on the next run" };

module.exports = { loadCache, saveCache, loadDecisions, applyDecisions, classifyAll, tidy, parseCsvLine, UNREAD };
