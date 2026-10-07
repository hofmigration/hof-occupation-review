// 6-aggregate.js — from assessed leads to the numbers and lists in the report.
// No network, so it can be tested with invented leads.
const { CAN, CANNOT, ASSESS } = require("./3-assess");
const { fmtRange, EDU_NAMES } = require("./1-facts");

function aggregate(leads, lookupStats) {
  const programs = { au: { [CAN]: 0, [CANNOT]: 0, [ASSESS]: 0 }, ca: { [CAN]: 0, [CANNOT]: 0, [ASSESS]: 0 }, us: { [CAN]: 0, [CANNOT]: 0, [ASSESS]: 0 } };
  const tabs = { markedEligible: [], markedOut: [], customers: [] };
  const completeness = { "Job title": 0, Education: 0, Age: 0, Experience: 0, Nationality: 0 };
  let noneCount = 0, customerCount = 0;
  const groups = new Map(), cant = new Map();
  const nat = new Map(), src = new Map(), frm = new Map();

  const bump = (map, key, L) => {
    const g = map.get(key) || { key, leads: 0, customers: 0, au: 0, ca: 0, us: 0, none: 0 };
    g.leads++; if (L.f.customer) g.customers++;
    if (L.a.au.v === CAN) g.au++; if (L.a.ca.v === CAN) g.ca++; if (L.a.us.v === CAN) g.us++;
    if (L.a.none) g.none++;
    map.set(key, g);
  };

  for (const L of leads) {
    const { f, a } = L;
    for (const k of ["au", "ca", "us"]) programs[k][a[k].v]++;
    if (a.none) noneCount++;
    if (f.customer) customerCount++;
    if (a.markedEligibleButNot) tabs.markedEligible.push(L);
    if (a.markedOutButEligible) tabs.markedOut.push(L);
    if (a.customerIneligible) tabs.customers.push(L);

    if (f.titles.length) completeness["Job title"]++;
    if (f.edu != null) completeness.Education++;
    if (f.age) completeness.Age++;
    if (f.exp) completeness.Experience++;
    if (f.nationality !== "Not recorded") completeness.Nationality++;

    // occupations, grouped by what the title was read as
    const o = a.occ;
    const name = o.kind === "occupation" && o.occupation ? o.occupation : (o.title || "(no job title)");
    const key = name.toLowerCase();
    const g = groups.get(key) || { name, key, kind: o.kind, leads: 0, customers: 0, titles: new Map(), au: o.au, ca: o.ca, us: o.us, why: o.why || "",
      anzsco: o.anzsco || "", noc: o.noc || "", teer: o.teer, decided: !!o.decided };
    g.leads++; if (f.customer) g.customers++;
    g.titles.set(o.title, (g.titles.get(o.title) || 0) + 1);
    groups.set(key, g);

    if (o.kind !== "occupation") {
      const t = cant.get(o.title || "(blank)") || { title: o.title || "(no job title)", leads: 0, why: o.kind === "junk" ? "Can't be read" : o.kind === "no_occupation" ? "Not a job — check past work" : o.kind === "none" ? "Nothing recorded" : "Too vague — check duties" };
      t.leads++; cant.set(o.title || "(blank)", t);
    }

    bump(nat, f.nationality, L);
    bump(src, f.source, L);
    bump(frm, f.form || f.campaign || "(none recorded)", L);
  }

  const NAMES = { au: "Australia", ca: "Canada", us: "USA NIW" };
  const occupations = [...groups.values()].map((g) => {
    const cantList = ["au", "ca", "us"].filter((k) => (k === "us" ? g.us === "unlikely" : g[k] === "not_eligible"));
    return {
      ...g,
      examples: [...g.titles.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([t]) => t).join("; "),
      cantSome: g.kind === "occupation" && cantList.length > 0,
      cantAny: g.kind === "occupation" && cantList.length === 3,
      cantFor: cantList.map((k) => NAMES[k]).join(", "),
    };
  }).sort((x, y) => y.leads - x.leads);

  const sortGroups = (m) => [...m.values()].sort((x, y) => y.leads - x.leads);

  // per consultant: how many leads they own, and how many of their markings the rules disagree with
  const cons = new Map();
  const consRow = (o) => cons.get(o) || cons.set(o, { owner: o, leads: 0, markedEligible: 0, markedOut: 0 }).get(o);
  for (const L of leads) consRow(L.f.owner).leads++;
  tabs.markedEligible.forEach((L) => consRow(L.f.owner).markedEligible++);
  tabs.markedOut.forEach((L) => consRow(L.f.owner).markedOut++);
  const byConsultant = [...cons.values()].filter((c) => c.markedEligible || c.markedOut)
    .sort((x, y) => (y.markedEligible + y.markedOut) - (x.markedEligible + x.markedOut));
  const byNationality = sortGroups(nat);
  const natRecorded = byNationality.filter((g) => g.key !== "Not recorded");
  const natMissing = byNationality.find((g) => g.key === "Not recorded");

  return {
    programs, tabs, completeness, noneCount, customerCount, occupations, byConsultant,
    byNationality: natMissing ? [...natRecorded, natMissing] : natRecorded,
    bySource: sortGroups(src), byForm: sortGroups(frm).slice(0, 60),
    cantTell: [...cant.values()].sort((x, y) => y.leads - x.leads).slice(0, 1000),
    reader: lookupStats,
  };
}

// the per-lead display values and the one reason shown in the lead list
function present(L) {
  const { f, a } = L;
  const focusWhy = a.verdict ? a.verdict.why : "";
  const firstCannot = ["au", "ca", "us"].map((k) => a[k]).find((x) => x.v === CANNOT);
  return {
    ...L,
    edu: f.edu != null ? EDU_NAMES[f.edu] : "",
    age: fmtRange(f.age), exp: fmtRange(f.exp),
    reason: focusWhy || (firstCannot ? firstCannot.why : a.au.why),
  };
}

module.exports = { aggregate, present };
