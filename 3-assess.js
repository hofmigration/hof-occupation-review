// 3-assess.js — HOF's criteria, applied to one lead, program by program.
//
// Three outcomes, never two:
//   CAN     the occupation fits and no recorded fact breaks a hard rule
//   CANNOT  a recorded fact clearly breaks a hard rule
//   ASSESS  not enough is known — HOF's own criteria say to assess, not reject
//
// A missing fact never counts against a lead. Only a recorded one can.
const { SETTINGS } = require("./config");
const { fmtRange, EDU_NAMES } = require("./1-facts");

const CAN = "Can onboard", CANNOT = "Cannot onboard", ASSESS = "Needs assessment";

// the best reading of this lead's occupation: the first title that names a real job
function pickOccupation(titles, lookup) {
  let first = null;
  for (const t of titles) {
    const c = lookup(t);
    if (!c) continue;
    if (!first) first = { title: t, ...c };
    if (c.kind === "occupation") return { title: t, ...c };
  }
  return first || { title: "", occupation: "", kind: "none", au: "unclear", ca: "unclear", us: "unclear", why: "No job title recorded" };
}

const occReason = (o) =>
  o.kind === "none" ? "No job title recorded" :
  o.kind === "junk" ? "The job title can't be read" :
  o.kind === "no_occupation" ? "No current job — check past work" :
  o.kind === "unclear" ? "Job title too vague — check duties" : "Occupation unclear — check duties";

function australia(f, o) {
  const notes = [];
  if (f.age && f.age.min >= SETTINGS.AU_MAX_AGE) return { v: CANNOT, why: `Age ${fmtRange(f.age)} — must be under ${SETTINGS.AU_MAX_AGE}` };
  if (o.au === "not_eligible") return { v: CANNOT, why: `${o.occupation || o.title} is not on the 189/190/491 lists` };
  if (o.au !== "eligible") return { v: ASSESS, why: occReason(o) };
  if (!f.age) notes.push("age not recorded");
  else if (f.age.max >= SETTINGS.AU_MAX_AGE) notes.push(`age ${fmtRange(f.age)} — confirm under ${SETTINGS.AU_MAX_AGE}`);
  if (f.age && f.age.min >= 25 && f.age.max <= 39) notes.push("priority age 25–39");
  if (f.exp && f.exp.min >= 3) notes.push("3+ years experience");
  return { v: CAN, why: `${o.occupation || o.title} is on the lists${notes.length ? ` · ${notes.join(" · ")}` : ""}` };
}

function canada(f, o) {
  if (o.ca === "not_eligible") return { v: CANNOT, why: `${o.occupation || o.title} is TEER ${o.teer != null ? o.teer : "4 or 5"} — needs TEER 0–3` };
  if (f.exp && f.exp.max < SETTINGS.CA_MIN_EXPERIENCE) return { v: CANNOT, why: `${fmtRange(f.exp)} years' experience — needs at least ${SETTINGS.CA_MIN_EXPERIENCE}` };
  if (f.edu === 0) return { v: CANNOT, why: "No completed secondary education" };
  if (o.ca !== "eligible") return { v: ASSESS, why: occReason(o) };
  const notes = [];
  if (o.teer != null) notes.push(`TEER ${o.teer}`);
  if (f.age && f.age.min >= SETTINGS.CA_NO_AGE_POINTS) notes.push(`age ${fmtRange(f.age)} — no age points, not a reason to reject`);
  if (!f.exp) notes.push("experience not recorded");
  return { v: CAN, why: `${o.occupation || o.title}${notes.length ? ` · ${notes.join(" · ")}` : ""}` };
}

function usa(f, o) {
  const yrs = f.exp;
  const edu = f.edu;
  // Path 1: a master's or higher, or a bachelor's with 5+ years
  if (edu != null && edu >= 5) {
    if (o.us === "unlikely") return { v: ASSESS, why: `${EDU_NAMES[edu]}, but ${o.occupation || o.title} is manual work — check the degree's field` };
    return { v: CAN, why: `Path 1 — ${EDU_NAMES[edu]}` };
  }
  if (edu === 4) {
    if (o.us === "unlikely") return { v: CANNOT, why: `Bachelor's, but ${o.occupation || o.title} can't carry an NIW endeavour` };
    if (yrs && yrs.min >= SETTINGS.US_PATH1_BACHELOR_YEARS) return { v: CAN, why: `Path 1 — Bachelor's + ${fmtRange(yrs)} years` };
    if (yrs && yrs.max < SETTINGS.US_PATH1_BACHELOR_YEARS) return { v: ASSESS, why: `Bachelor's with ${fmtRange(yrs)} years — Path 1 needs 5; check exceptional ability` };
    return { v: ASSESS, why: "Bachelor's — confirm 5+ years' progressive experience" };
  }
  if (edu != null && edu <= 3) {
    if (yrs && yrs.min >= SETTINGS.US_PATH2_YEARS && o.us !== "unlikely") return { v: ASSESS, why: `${EDU_NAMES[edu]} with ${fmtRange(yrs)} years — only exceptional ability could work` };
    if (yrs && yrs.max < SETTINGS.US_PATH2_YEARS) return { v: CANNOT, why: `${EDU_NAMES[edu]} and ${fmtRange(yrs)} years — neither path is realistic` };
    if (o.us === "unlikely") return { v: CANNOT, why: `${EDU_NAMES[edu]}, and ${o.occupation || o.title} can't carry an NIW endeavour` };
    return { v: ASSESS, why: `${EDU_NAMES[edu]} — no degree; check exceptional ability` };
  }
  return { v: ASSESS, why: "Education not recorded" };
}

function assessLead(f, lookup) {
  const occ = pickOccupation(f.titles, lookup);
  const au = australia(f, occ), ca = canada(f, occ), us = usa(f, occ);
  const all = { au, ca, us };

  // can't onboard for any program we offer
  const none = au.v === CANNOT && ca.v === CANNOT && us.v === CANNOT;

  // the program that matters for this lead: what they were marked for, bought, or enquired about
  const focus = f.interest === "ca/au"
    ? [au.v, ca.v].includes(CAN) ? (au.v === CAN ? "au" : "ca") : "au"
    : ["au", "ca", "us"].includes(f.interest) ? f.interest : "";
  const verdict = focus ? all[focus] : null;

  // what the consultant recorded, against what the rules say
  const markedFor = SETTINGS.MARKED_ELIGIBLE[f.stageValue] || "";
  const markedOut = SETTINGS.MARKED_INELIGIBLE.includes(f.stageValue);
  const eligibleSomewhere = [au, ca, us].filter((x) => x.v === CAN);

  return {
    occ, au, ca, us, none, focus, verdict,
    markedEligibleButNot: markedFor && all[markedFor].v === CANNOT ? { program: markedFor, why: all[markedFor].why } : null,
    markedOutButEligible: markedOut && eligibleSomewhere.length
      ? { programs: ["au", "ca", "us"].filter((k) => all[k].v === CAN), why: eligibleSomewhere[0].why } : null,
    customerIneligible: f.customer && (
      f.customerPrograms.includes("ca/au") && !f.customerPrograms.some((p) => ["au", "ca"].includes(p))
        ? (au.v === CANNOT && ca.v === CANNOT ? { program: "ca/au", why: `${au.why}; ${ca.why}` } : null)
        : (() => { const k = ["us", "au", "ca"].find((p) => f.customerPrograms.includes(p) && all[p].v === CANNOT); return k ? { program: k, why: all[k].why } : null; })()
    ),
  };
}

const PROGRAM_NAME = { au: "Australia", ca: "Canada", us: "USA NIW", "ca/au": "Canada or Australia", other: "Other", "": "" };
module.exports = { assessLead, pickOccupation, australia, canada, usa, CAN, CANNOT, ASSESS, PROGRAM_NAME };
