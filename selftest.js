// selftest.js — every rule, against invented leads where the answer is known.
// Runs before each review: a rule that stops behaving stops the run.
const F = require("./1-facts");
const C = require("./2-classify");
const A = require("./3-assess");
const { aggregate, present } = require("./6-aggregate");
const { SETTINGS } = require("./config");

let pass = 0, fail = 0;
const check = (l, ok, d = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${l}${ok || !d ? "" : `\n        ${d}`}`); ok ? pass++ : fail++; };
const NOW = Date.parse("2026-10-07T12:00:00Z");
const LABELS = {
  age_range: { "18-32": "18-30", "33-40": "31-35", "41-45": "36-40", "46-50": "41-45", "50+": "46-49", "50++": "50+" },
  education_level: { HighSchool: "HighSchool", Other: "Diploma", "College Level": "College Level", "Bachelor's Degree": "Bachelor's Degree", "Master's Degree": "Master's Degree", phD: "PhD" },
  years_of_experience_new: { "1-4": "1-4", "5-7": "5-7", "8-9": "8-9", "10+": "10+" },
  lead_stage: { Qualified: "Qualified CAN", "Qualified AUS": "Qualified AUS", "USA NIW": "USA NIW", Ineligible: "Ineligible", "Occupation Not Listed": "Occupation Not Listed" },
  nationality: { Pakistani: "Pakistani", Arab: "Arab" },
};
const OCC = {
  chef:   { occupation: "Chef", kind: "occupation", au: "eligible", ca: "eligible", us: "unlikely", teer: 2, why: "on MLTSSL; TEER 2" },
  driver: { occupation: "Driver", kind: "occupation", au: "not_eligible", ca: "not_eligible", us: "unlikely", teer: 5, why: "TEER 5" },
  civil:  { occupation: "Civil Engineer", kind: "occupation", au: "eligible", ca: "eligible", us: "plausible", teer: 1, why: "" },
  draft:  { occupation: "Civil Draughtsperson", kind: "occupation", au: "eligible", ca: "eligible", us: "plausible", teer: 2, why: "" },
  owner:  { occupation: "", kind: "unclear", au: "unclear", ca: "unclear", us: "unclear", why: "too vague" },
  student:{ occupation: "", kind: "no_occupation", au: "unclear", ca: "unclear", us: "unclear", why: "not a job" },
};
const lead = (p, occ) => {
  const f = F.facts({ id: String(Math.random()).slice(2), properties: { createdate: "2026-09-10T10:00:00Z", jobtitle: "x", ...p } }, LABELS, {}, new Map(), NOW);
  return { f, a: A.assessLead(f, () => occ) };
};

console.log("OCCUPATION REVIEW — SELF-TEST\n");

// ---- reading fields by their label ----
check("Age Range stored '46-50' reads as the label 41–45", JSON.stringify(F.age({ age_range: "46-50" }, LABELS, NOW)) === JSON.stringify({ min: 41, max: 45, from: "Age Range" }));
check("Age Range stored '50++' reads as 50+", F.age({ age_range: "50++" }, LABELS, NOW).min === 50);
check("an exact Age beats the range", F.age({ age: "33", age_range: "50++" }, LABELS, NOW).min === 33);
check("date of birth gives an age", F.age({ date_of_birth: "1990-10-01" }, LABELS, NOW).min === 36);
check("Education Level stored 'Other' reads as Diploma", F.education({ education_level: "Other" }, LABELS) === 3);
check("the consultant's Education Level beats the forms", F.education({ education_level: "Bachelor's Degree", what_is_your_highest_level_of_education_: "phd" }, LABELS) === 4);
check("without it, the highest form answer counts", F.education({ what_is_your_education_level_: "bachelor's_degree", what_is_your_highest_level_of_education_: "master's_degree" }, LABELS) === 5);
["bachelor's_degree:4", "master's_degree:5", "phd:6", "MBBS:4", "DAE:3", "Matric:1", "College Level:2", "MBA:5", "High School:1"]
  .forEach((x) => { const [t, lv] = x.split(":"); check(`education "${t}" is level ${lv}`, F.eduLevel(t) === +lv); });
check("experience '10+' is at least 10", F.experience({ years_of_experience_new: "10+" }, LABELS).min === 10);
check("experience 'fresh' is zero", F.experience({ years_of_experience: "fresh" }, LABELS).max === 0);
check("experience '6 months' is half a year", F.experience({ years_of_experience: "6 months" }, LABELS).max === 0.5);
check("job titles are tidied the same way", F.normTitle("  Pharmacist. ") === "pharmacist" && F.normTitle("HSE  OFFICER") === "hse officer");
check("the consultant's Occupation is read before Job Title", F.titleCandidates({ occupation: "Chef", jobtitle: "cook" })[0] === "chef");

// ---- Australia ----
check("AU: an eligible occupation can be onboarded", lead({}, OCC.chef).a.au.v === A.CAN);
check("AU: 50+ cannot — must be under 45", lead({ age_range: "50++" }, OCC.chef).a.au.v === A.CANNOT);
check("AU: the 41–45 band is NOT rejected — it may be under 45", lead({ age_range: "46-50" }, OCC.chef).a.au.v === A.CAN);
check("AU: exactly 45 cannot", lead({ age: "45" }, OCC.chef).a.au.v === A.CANNOT);
check("AU: an occupation off the lists cannot", lead({}, OCC.driver).a.au.v === A.CANNOT);
check("AU: a vague title needs assessment, not rejection", lead({}, OCC.owner).a.au.v === A.ASSESS);
check("AU: a student needs assessment — past work may count", lead({}, OCC.student).a.au.v === A.ASSESS);
check("AU: little experience is never a reason to reject", lead({ years_of_experience: "1" }, OCC.chef).a.au.v === A.CAN);

// ---- Canada ----
check("CA: TEER 0–3 can be onboarded", lead({}, OCC.civil).a.ca.v === A.CAN);
check("CA: TEER 5 cannot", lead({}, OCC.driver).a.ca.v === A.CANNOT);
check("CA: under a year's experience cannot", lead({ years_of_experience: "6 months" }, OCC.civil).a.ca.v === A.CANNOT);
check("CA: age alone never rejects", lead({ age: "52" }, OCC.civil).a.ca.v === A.CAN);
check("CA: a vague title needs assessment", lead({}, OCC.owner).a.ca.v === A.ASSESS);

// ---- USA NIW ----
check("US: a master's meets Path 1", lead({ education_level: "Master's Degree" }, OCC.civil).a.us.v === A.CAN);
check("US: bachelor's + 5–7 years meets Path 1", lead({ education_level: "Bachelor's Degree", years_of_experience_new: "5-7" }, OCC.civil).a.us.v === A.CAN);
check("US: bachelor's + 1–4 years needs assessment", lead({ education_level: "Bachelor's Degree", years_of_experience_new: "1-4" }, OCC.civil).a.us.v === A.ASSESS);
check("US: bachelor's, experience unknown, needs assessment", lead({ education_level: "Bachelor's Degree" }, OCC.civil).a.us.v === A.ASSESS);
check("US: diploma + under 10 years cannot", lead({ education_level: "Other", years_of_experience_new: "1-4" }, OCC.draft).a.us.v === A.CANNOT);
check("US: diploma + 10+ years needs assessment (exceptional ability)", lead({ education_level: "Other", years_of_experience_new: "10+" }, OCC.draft).a.us.v === A.ASSESS);
check("US: no education recorded needs assessment", lead({}, OCC.civil).a.us.v === A.ASSESS);
check("US: bachelor's in manual work cannot", lead({ education_level: "Bachelor's Degree" }, OCC.driver).a.us.v === A.CANNOT);
check("US: a master's in manual work is checked, not rejected", lead({ education_level: "Master's Degree" }, OCC.driver).a.us.v === A.ASSESS);

// ---- what was marked against what the rules say (the real sample) ----
const chefOut = lead({ lead_stage: "Occupation Not Listed" }, OCC.chef);
check("an executive chef marked Occupation Not Listed is flagged as could-onboard", !!chefOut.a.markedOutButEligible && chefOut.a.markedOutButEligible.programs.includes("au"));
const draftNiw = lead({ lead_stage: "USA NIW", education_level: "Other", years_of_experience_new: "1-4" }, OCC.draft);
check("a draughtsman marked USA NIW with a diploma and 1–4 years is flagged", !!draftNiw.a.markedEligibleButNot && draftNiw.a.markedEligibleButNot.program === "us");
check("a driver correctly marked Occupation Not Listed is not flagged", !lead({ lead_stage: "Occupation Not Listed" }, OCC.driver).a.markedOutButEligible);
check("a properly qualified lead is not flagged", !lead({ lead_stage: "Qualified", education_level: "Master's Degree" }, OCC.civil).a.markedEligibleButNot);
check("a driver can't be onboarded for any program once education rules NIW out", lead({ education_level: "Bachelor's Degree" }, OCC.driver).a.none === true);

// ---- customers ----
const custLead = (prog, occ, p = {}) => {
  const map = new Map([["c1", new Set([prog])]]);
  const f = F.facts({ id: "c1", properties: { createdate: "2026-09-10T10:00:00Z", jobtitle: "x", ...p } }, LABELS, {}, map, NOW);
  return A.assessLead(f, () => occ);
};
check("a USA NIW customer with a diploma and 1–4 years is flagged", !!custLead("us", OCC.draft, { education_level: "Other", years_of_experience_new: "1-4" }).customerIneligible);
check("a USA NIW customer with a master's is not", !custLead("us", OCC.civil, { education_level: "Master's Degree" }).customerIneligible);
check("a Canada/Australia customer is flagged only if both programs fail", !custLead("ca/au", OCC.civil).customerIneligible && !!custLead("ca/au", OCC.driver).customerIneligible);

// ---- program of interest ----
check("a USA campaign means USA", F.programOfInterest({ hs_analytics_source_data_2: "(glb) ksa usa campaign" }, LABELS, null) === "us");
check("a Canada campaign means Canada", F.programOfInterest({ first_conversion_event_name: "Facebook Lead Ads: (glb) ksa canada campaign" }, LABELS, null) === "ca");
check("the Lead Stage beats the campaign", F.programOfInterest({ lead_stage: "Qualified AUS", hs_analytics_source_data_2: "(glb) usa" }, LABELS, null) === "au");

// ---- HOF decisions override the reader ----
const dec = C.loadDecisions("title,australia,canada,usa_niw,note\nsteel detailer,not eligible,eligible,unlikely,Waleed\nChef,eligible,,,\n");
check("a title-level decision overrides the reader", C.applyDecisions("steel detailer", OCC.draft, dec).au === "not_eligible");
check("an occupation-level decision covers every title read as it", C.applyDecisions("head chef", { ...OCC.chef, au: "not_eligible" }, dec).au === "eligible");
check("a blank column leaves the reader's view", C.applyDecisions("head chef", OCC.chef, dec).ca === "eligible");
check("a vague title can never be judged eligible or not", C.tidy({ kind: "unclear", au: "not_eligible", ca: "eligible" }).au === "unclear");
check("quoted CSV values are read correctly", C.parseCsvLine('"sales, retail",no,no,unlikely,"says ""no"""')[0] === "sales, retail");

// ---- aggregation ----
const leads = [lead({}, OCC.chef), lead({}, OCC.chef), lead({ education_level: "Bachelor's Degree" }, OCC.driver), lead({ lead_stage: "Occupation Not Listed" }, OCC.chef), lead({}, OCC.owner)]
  .map((L) => present({ ...L, link: "https://x" }));
const R = aggregate(leads, { titles: 3, read: 3, cached: 0, decided: 0, left: 0, stopped: "" });
check("every lead is counted once per program", ["au", "ca", "us"].every((k) => Object.values(R.programs[k]).reduce((x, y) => x + y, 0) === leads.length));
check("an occupation we can't onboard anywhere is listed", R.occupations.some((o) => o.name === "Driver" && o.cantAny));
check("an eligible occupation is not listed as can't-onboard", !R.occupations.some((o) => o.name === "Chef" && o.cantAny));
check("a vague title goes to Can't tell", R.cantTell.length === 1);
check("'Not recorded' nationality is kept as its own row, last", R.byNationality[R.byNationality.length - 1].key === "Not recorded");

// ---- by consultant ----
check("consultants with mismatches are listed", Array.isArray(R.byConsultant) && R.byConsultant.length >= 1);
check("a consultant's mismatch counts add up", R.byConsultant.reduce((t, c) => t + c.markedOut, 0) === R.tabs.markedOut.length);

// ---- the email carries the whole report ----
const { buildEmail, fitEmail, LIMIT } = require("./5-email");
const R2 = { ...R, leads, periodText: "2025-01-01 to 2026-10-07" };
const html = buildEmail(R2, false);
["By program", "Occupations we can't onboard", "Turned away, but could be onboarded", "By consultant", "By nationality", "By source", "Job titles a person needs to read", "How complete the data is", "How it was judged"]
  .forEach((sec) => check(`the email includes "${sec}"`, html.includes(sec), sec));
check("the email links each lead to HubSpot", /href="https:\/\/x"/.test(html));
check("the email escapes text", !/<script/i.test(html));

// a very large result must still fit under Gmail's clipping limit
const big = Array.from({ length: 6000 }, (_, i) => {
  const L = lead({ lead_stage: i % 2 ? "Occupation Not Listed" : "USA NIW", education_level: "Other", years_of_experience_new: "1-4", firstname: "Very Long Client Name", lastname: String(i), hubspot_owner_id: String(i % 40) }, i % 2 ? OCC.chef : OCC.draft);
  return present({ ...L, link: "https://app.hubspot.com/contacts/23735726/record/0-1/" + (900000000 + i) });
});
const RB = { ...aggregate(big, { titles: 2, read: 2, cached: 0, decided: 0, left: 0, stopped: "" }), leads: big, periodText: "2025-01-01 to 2026-10-07" };
const fit = fitEmail(RB, false);
check(`a 6,000-lead result fits under Gmail's limit (${Math.round(fit.bytes / 1024)} KB)`, fit.bytes <= LIMIT);
check("when shrunk, it says how many more are in the workbook", /more in the workbook/.test(fit.html));

// ---- config ----
check("Australia's age limit is under 45", SETTINGS.AU_MAX_AGE === 45);
check("only titles are sent to the reader — no names in the prompt", !/firstname|lastname|email|phone/.test(require("fs").readFileSync("./2-classify.js", "utf8").split("const PROMPT")[1].split("function tidy")[0]));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log("\nA rule is not behaving. Fix it before trusting a report."); process.exit(1); }
