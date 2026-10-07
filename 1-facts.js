// 1-facts.js — turning what HubSpot holds into facts the rules can use.
//
// Everything here is plain code with no network, so every reading can be tested. Every
// dropdown is read by its LABEL, never its stored value: several HOF fields store one
// thing and show another.
const { SETTINGS } = require("./config");

const clean = (s) => String(s == null ? "" : s).trim();
const label = (labels, prop, v) => { const s = clean(v); return s && labels[prop] && labels[prop][s] ? labels[prop][s] : s; };

// ---- job titles ----
// "  Pharmacist  " and "pharmacist." are one title; the reader sees each unique one once.
function normTitle(s) {
  return clean(s).toLowerCase()
    .replace(/[\u200e\u200f]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s.,;:\-_*#'"]+|[\s.,;:\-_*#'"]+$/g, "")
    .slice(0, 120);
}
function titleCandidates(p) {
  const out = [];
  for (const f of SETTINGS.TITLE_FIELDS) { const t = normTitle(p[f]); if (t && !out.includes(t)) out.push(t); }
  return out;
}

// ---- education: 0 none · 1 secondary · 2 higher secondary/college · 3 diploma/trade · 4 bachelor · 5 master · 6 doctorate ----
const EDU_NAMES = ["No education", "Secondary", "College level", "Diploma / trade", "Bachelor's", "Master's", "PhD"];
function eduLevel(text) {
  const t = clean(text).toLowerCase().replace(/[_']/g, " ");
  if (!t) return null;
  if (/\b(phd|ph d|doctor(ate)?|dphil|md\b|pharm d|pharmd)\b/.test(t)) return 6;
  if (/\b(master|masters|mba|msc|m sc|ms|mphil|m phil|m tech|mtech|ma|mcom|m com|llm|mca|meng|m eng|postgraduate|post graduate)\b/.test(t)) return 5;
  if (/\b(bachelor|bachelors|bba|bsc|b sc|bs|ba|bcom|b com|btech|b tech|be|b e|beng|llb|mbbs|bds|bpharm|graduate|graduation|degree|university)\b/.test(t)) return 4;
  if (/\b(diploma|dae|associate|polytechnic|trade|certificate|certification|vocational|technical college|other)\b/.test(t)) return 3;
  if (/\b(college|intermediate|fsc|f sc|hsc|higher secondary|a level|a levels|12th|fa\b)/.test(t)) return 2;
  if (/\b(high ?school|matric|ssc|secondary|o level|o levels|10th|school)\b/.test(t)) return 1;
  if (/\b(none|no education|illiterate|primary)\b/.test(t)) return 0;
  return null;
}
// The consultant's Education Level counts first; otherwise the highest the client gave.
function education(p, labels) {
  const own = eduLevel(label(labels, "education_level", p.education_level));
  if (own != null) return own;
  let best = null;
  for (const f of SETTINGS.EDUCATION_FIELDS.slice(1)) {
    const lv = eduLevel(label(labels, f, p[f]));
    if (lv != null && (best == null || lv > best)) best = lv;
  }
  return best;
}

// ---- ranges: age and experience are often only known as a band ----
function rangeFrom(text) {
  const t = clean(text).toLowerCase();
  if (!t) return null;
  let m;
  if ((m = t.match(/(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})/))) return { min: +m[1], max: +m[2] };
  if ((m = t.match(/(\d{1,2})\s*(\+|plus|or more|and above|above)/)) || (m = t.match(/(?:above|over|more than|greater than)\s*(\d{1,2})/)))
    return { min: +m[1] + (/(above|over|more than|greater than)/.test(t) && !/\+|plus|or more|and above/.test(t) ? 1 : 0), max: 99 };
  if ((m = t.match(/(?:under|below|less than)\s*(\d{1,2})/))) return { min: 0, max: +m[1] - 1 };
  if ((m = t.match(/(\d{1,2}(?:\.\d+)?)/))) { const n = +m[1]; return { min: n, max: n }; }
  return null;
}

function age(p, labels, nowMs) {
  const F = SETTINGS.AGE_FIELDS;
  const exact = Number(p[F.exact]);
  if (Number.isFinite(exact) && exact >= 15 && exact <= 90) return { min: exact, max: exact, from: "Age" };
  const dob = Date.parse(clean(p[F.dob]));
  if (dob && dob < nowMs) {
    const a = Math.floor((nowMs - dob) / (365.25 * 864e5));
    if (a >= 15 && a <= 90) return { min: a, max: a, from: "Date of birth" };
  }
  const tx = rangeFrom(p[F.text]);
  if (tx && tx.min >= 15 && tx.max <= 99) return { ...tx, from: "What is your age?" };
  const rg = rangeFrom(label(labels, F.range, p[F.range]));      // the LABEL — "41-45", not the stored "46-50"
  if (rg) return { ...rg, from: "Age Range" };
  return null;
}

function experience(p, labels) {
  const F = SETTINGS.EXPERIENCE_FIELDS;
  const rg = rangeFrom(label(labels, F.range, p[F.range]));
  if (rg) return { ...rg, from: "Years Of Experience" };
  const t = clean(p[F.text]).toLowerCase();
  if (!t) return null;
  if (/fresh|no experience|none|fresher/.test(t)) return { min: 0, max: 0, from: "YEARS OF EXPERIENCE" };
  const m = t.match(/(\d{1,2})\s*(month|months)/);
  if (m) return { min: +m[1] / 12, max: +m[1] / 12, from: "YEARS OF EXPERIENCE" };
  const r = rangeFrom(t);
  return r ? { ...r, from: "YEARS OF EXPERIENCE" } : null;
}

const fmtRange = (r) => !r ? "" : r.min === r.max ? String(Math.round(r.min * 10) / 10) : r.max >= 99 ? `${r.min}+` : `${r.min}–${r.max}`;

// ---- which program the lead was after ----
function programOfInterest(p, labels, customerPrograms) {
  const stage = clean(p[SETTINGS.STAGE_FIELD]);
  if (SETTINGS.MARKED_ELIGIBLE[stage]) return SETTINGS.MARKED_ELIGIBLE[stage];
  if (customerPrograms && customerPrograms.size) {
    for (const k of ["us", "au", "ca"]) if (customerPrograms.has(k)) return k;
    if (customerPrograms.has("ca/au")) return "ca/au";
  }
  const where = `${clean(p[SETTINGS.SOURCE_FIELDS.campaign])} ${clean(p[SETTINGS.SOURCE_FIELDS.form])}`.toLowerCase();
  if (/\b(usa|niw|eb2|eb-2|eb 2|green card|us permanent)\b/.test(where)) return "us";
  if (/\b(australia|aus|189|190|491)\b/.test(where)) return "au";
  if (/\b(canada|can|express entry|pnp)\b/.test(where)) return "ca";
  if (/\b(germany|spain|portugal|visit|work permit|finland|norway|student)\b/.test(where)) return "other";
  return "";
}

function facts(contact, labels, owners, customerMap, nowMs) {
  const p = contact.properties || {};
  const id = String(contact.id);
  const cust = customerMap.get(id);
  const stageVal = clean(p[SETTINGS.STAGE_FIELD]);
  return {
    id,
    name: [clean(p.firstname), clean(p.lastname)].filter(Boolean).join(" ") || "(no name)",
    created: Date.parse(p.createdate) || 0,
    titles: titleCandidates(p),
    rawTitle: clean(p.occupation) || clean(p.jobtitle) || "",
    edu: education(p, labels),
    age: age(p, labels, nowMs),
    exp: experience(p, labels),
    nationality: label(labels, SETTINGS.NATIONALITY_FIELD, p[SETTINGS.NATIONALITY_FIELD]) || "Not recorded",
    residence: label(labels, SETTINGS.RESIDENCE_FIELD, p[SETTINGS.RESIDENCE_FIELD]) || "",
    stageValue: stageVal,
    stage: label(labels, SETTINGS.STAGE_FIELD, stageVal) || "No lead stage",
    source: label(labels, SETTINGS.SOURCE_FIELDS.source, p[SETTINGS.SOURCE_FIELDS.source]) || "Unknown",
    campaign: clean(p[SETTINGS.SOURCE_FIELDS.campaign]),
    form: clean(p[SETTINGS.SOURCE_FIELDS.form]).replace(/^facebook lead ads:\s*/i, ""),
    owner: owners[p.hubspot_owner_id] || (p.hubspot_owner_id ? `Owner ${p.hubspot_owner_id}` : "Unassigned"),
    customer: !!cust, customerPrograms: cust ? [...cust] : [],
    interest: programOfInterest(p, labels, cust),
  };
}

module.exports = { normTitle, titleCandidates, eduLevel, education, age, experience, rangeFrom, fmtRange, programOfInterest, facts, EDU_NAMES };
