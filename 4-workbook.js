// 4-workbook.js — the Excel file, one question per tab. Written as a stream, because the
// lead list can run past a hundred thousand rows.
const ExcelJS = require("exceljs");
const { SETTINGS } = require("./config");
const { PROGRAM_NAME, CAN, CANNOT, ASSESS } = require("./3-assess");

const NAVY = "FF16205E", ROYAL = "FF1F2F8F", LINE = "FFE6E9F1";
const RED = "FFFDECEA", REDTX = "FFB42318", AMBER = "FFFFF5E8", AMBERTX = "FF9A5B0C", GREEN = "FFE9F6EE", GREENTX = "FF1E7A4D";
const thin = { style: "thin", color: { argb: LINE } };
const BOX = { top: thin, left: thin, bottom: thin, right: thin };
const F = (o = {}) => ({ name: "Arial", size: 10, ...o });
const fill = (c) => ({ type: "pattern", pattern: "solid", fgColor: { argb: c } });
const VCOL = { [CAN]: [GREEN, GREENTX], [CANNOT]: [RED, REDTX], [ASSESS]: [AMBER, AMBERTX] };
const OCCV = { eligible: "Eligible", not_eligible: "Not eligible", unclear: "Unclear", plausible: "Plausible", unlikely: "Unlikely" };
const OCCCOL = { eligible: [GREEN, GREENTX], plausible: [GREEN, GREENTX], not_eligible: [RED, REDTX], unlikely: [RED, REDTX], unclear: [AMBER, AMBERTX] };
const day = (t) => (t ? new Date(t + SETTINGS.TZ_OFFSET_HOURS * 3600e3).toISOString().slice(0, 10) : "");
const pct = (n, d) => (d ? `${Math.round((n / d) * 1000) / 10}%` : "—");

function sheet(wb, name, widths, opts = {}) {
  const ws = wb.addWorksheet(name, { views: [{ state: opts.freeze ? "frozen" : "normal", ySplit: opts.freeze || 0, showGridLines: false }] });
  ws.columns = widths.map((w) => ({ width: w }));
  return ws;
}
function titleRow(ws, text, sub) {
  const r = ws.addRow([text]);
  r.getCell(1).font = F({ bold: true, size: 14, color: { argb: NAVY } }); r.height = 24; r.commit();
  if (sub) { const s = ws.addRow([sub]); s.getCell(1).font = F({ color: { argb: "FF4A5262" } }); s.commit(); }
}
function headerRow(ws, labels) {
  const r = ws.addRow(labels);
  r.eachCell((c) => { c.font = F({ bold: true, color: { argb: "FFFFFFFF" } }); c.fill = fill(NAVY); c.border = BOX; c.alignment = { vertical: "middle", wrapText: true }; });
  r.height = 22; r.commit();
}
function dataRow(ws, vals, paint = {}) {
  const r = ws.addRow(vals);
  r.eachCell((c, col) => {
    c.border = BOX; c.alignment = { vertical: "top", wrapText: false };
    const v = vals[col - 1];
    if (v && typeof v === "object" && v.hyperlink) c.font = F({ color: { argb: ROYAL }, underline: true });
    else c.font = F();
    if (paint[col] && paint[col][0]) { c.fill = fill(paint[col][0]); c.font = F({ bold: true, color: { argb: paint[col][1] } }); }
  });
  r.commit();
}
const blank = (ws) => ws.addRow([]).commit();

async function writeWorkbook(file, R) {
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ filename: file, useStyles: true, useSharedStrings: false });
  const n = R.leads.length;

  // ---------- 1. Summary ----------
  let ws = sheet(wb, "Summary", [52, 16, 16, 16, 16, 16]);
  titleRow(ws, "Occupation eligibility review", `${R.periodText} · ${n.toLocaleString()} leads · judged from what HubSpot holds, not from the Lead Stage`);
  blank(ws);
  headerRow(ws, ["Program", "Can onboard", "Cannot onboard", "Needs assessment", "Can onboard %", "Cannot %"]);
  for (const k of ["au", "ca", "us"]) {
    const c = R.programs[k];
    dataRow(ws, [PROGRAM_NAME[k], c[CAN], c[CANNOT], c[ASSESS], pct(c[CAN], n), pct(c[CANNOT], n)], { 2: VCOL[CAN], 3: VCOL[CANNOT], 4: VCOL[ASSESS] });
  }
  blank(ws);
  headerRow(ws, ["The questions", "Leads", "% of leads", "", "", ""]);
  [["Can't onboard for any program", R.noneCount],
   ["Marked eligible by a consultant, but the rules say no", R.tabs.markedEligible.length],
   ["Marked Ineligible / Occupation Not Listed, but could be onboarded", R.tabs.markedOut.length],
   ["Customers whose profile fails the criteria", R.tabs.customers.length],
   ["Customers in the period", R.customerCount]].forEach(([k, v], i) => dataRow(ws, [k, v, pct(v, n)], i < 4 && v ? { 2: VCOL[CANNOT] } : {}));
  blank(ws);
  headerRow(ws, ["How complete the data is", "Leads with it", "% of leads", "", "", ""]);
  Object.entries(R.completeness).forEach(([k, v]) => dataRow(ws, [k, v, pct(v, n)]));
  blank(ws);
  headerRow(ws, ["Job titles", "Count", "", "", "", ""]);
  [["Different job titles in the period", R.reader.titles],
   ["Read this run", R.reader.read], ["Already known from earlier runs", R.reader.cached],
   ["Settled by HOF's decisions file", R.reader.decided], ["Not read yet — on the next run", R.reader.left]]
    .forEach(([k, v], i) => dataRow(ws, [k, v], i === 4 && v ? { 2: VCOL[ASSESS] } : {}));
  if (R.reader.stopped) dataRow(ws, [`Reading stopped early: ${R.reader.stopped}. Run again to carry on.`]);
  blank(ws);
  headerRow(ws, ["Occupations with the most leads we can't onboard", "Leads", "Australia", "Canada", "USA NIW", ""]);
  R.occupations.filter((o) => o.cantAny).slice(0, 15).forEach((o) =>
    dataRow(ws, [o.name, o.leads, OCCV[o.au], OCCV[o.ca], OCCV[o.us]], { 3: OCCCOL[o.au], 4: OCCCOL[o.ca], 5: OCCCOL[o.us] }));
  await ws.commit();

  // ---------- 2. Occupations we can't onboard ----------
  ws = sheet(wb, "Occupations we can't onboard", [34, 9, 10, 13, 13, 13, 26, 46, 40, 10, 9, 6, 11], { freeze: 3 });
  titleRow(ws, "Occupations we can't onboard, for at least one program", "Judged on the occupation alone. Most leads first. 'Decided by HOF' means occupation-decisions.csv settled it.");
  headerRow(ws, ["Occupation", "Leads", "Customers", "Australia", "Canada", "USA NIW", "Can't onboard for", "Why", "Titles typed", "ANZSCO", "NOC", "TEER", "Decided by"]);
  R.occupations.filter((o) => o.cantSome).forEach((o) => dataRow(ws,
    [o.name, o.leads, o.customers, OCCV[o.au], OCCV[o.ca], OCCV[o.us], o.cantFor, o.why, o.examples, o.anzsco, o.noc, o.teer ?? "", o.decided ? "HOF" : "Reader"],
    { 4: OCCCOL[o.au], 5: OCCCOL[o.ca], 6: OCCCOL[o.us] }));
  await ws.commit();

  // ---------- 3. All occupations, for review ----------
  ws = sheet(wb, "All occupations (review)", [34, 30, 9, 13, 13, 13, 46, 40, 11], { freeze: 3 });
  titleRow(ws, "Every occupation, to review once",
    "To change a verdict, copy the 'Decision key' into occupation-decisions.csv with your answer for each program. It then overrides the reader on every future run.");
  headerRow(ws, ["Occupation", "Decision key", "Leads", "Australia", "Canada", "USA NIW", "Why", "Titles typed", "Decided by"]);
  R.occupations.forEach((o) => dataRow(ws, [o.name, o.key, o.leads, OCCV[o.au], OCCV[o.ca], OCCV[o.us], o.why, o.examples, o.decided ? "HOF" : "Reader"],
    { 4: OCCCOL[o.au], 5: OCCCOL[o.ca], 6: OCCCOL[o.us] }));
  await ws.commit();

  // ---------- 4–6. The lead-level questions ----------
  const leadCols = ["Name", "Job title", "Read as", "Education", "Age", "Experience", "Lead stage", "Owner", "Created", "HubSpot"];
  const leadVals = (L) => [L.f.name, L.f.rawTitle, L.a.occ.occupation || L.a.occ.title, L.edu, L.age, L.exp, L.f.stage, L.f.owner, day(L.f.created), { text: "Open", hyperlink: L.link }];

  ws = sheet(wb, "Marked eligible, rules say no", [14, 52, 24, 30, 26, 16, 10, 12, 16, 22, 11, 8], { freeze: 3 });
  titleRow(ws, "Marked eligible by a consultant, but the rules say no", "Waleed's question: leads taken forward that HOF's criteria would not accept.");
  headerRow(ws, ["Marked for", "Why the rules say no", ...leadCols]);
  R.tabs.markedEligible.forEach((L) => dataRow(ws, [PROGRAM_NAME[L.a.markedEligibleButNot.program], L.a.markedEligibleButNot.why, ...leadVals(L)], { 1: VCOL[CANNOT] }));
  await ws.commit();

  ws = sheet(wb, "Marked out, could onboard", [24, 52, 24, 30, 26, 16, 10, 12, 16, 22, 11, 8], { freeze: 3 });
  titleRow(ws, "Marked Ineligible or Occupation Not Listed, but could be onboarded", "Leads turned away that fit at least one program — business that may have been lost.");
  headerRow(ws, ["Could onboard for", "Why", ...leadCols]);
  R.tabs.markedOut.forEach((L) => dataRow(ws, [L.a.markedOutButEligible.programs.map((k) => PROGRAM_NAME[k]).join(", "), L.a.markedOutButEligible.why, ...leadVals(L)], { 1: VCOL[CAN] }));
  await ws.commit();

  ws = sheet(wb, "Customers — ineligible profile", [18, 52, 24, 30, 26, 16, 10, 12, 16, 22, 11, 8], { freeze: 3 });
  titleRow(ws, "Customers whose recorded profile fails the criteria", "Clients already taken on. Check each one — the risk here is refunds and complaints.");
  headerRow(ws, ["Customer for", "Why it fails", ...leadCols]);
  R.tabs.customers.forEach((L) => dataRow(ws, [PROGRAM_NAME[L.a.customerIneligible.program], L.a.customerIneligible.why, ...leadVals(L)], { 1: VCOL[CANNOT] }));
  await ws.commit();

  // ---------- 6b. By consultant ----------
  ws = sheet(wb, "By consultant", [30, 12, 26, 26], { freeze: 3 });
  titleRow(ws, "Where the markings and the rules disagree, by consultant", "The owner of each lead. A high number is a pattern worth a conversation, not proof on its own.");
  headerRow(ws, ["Consultant", "Leads owned", "Marked eligible, rules say no", "Turned away, could onboard"]);
  R.byConsultant.forEach((c) => dataRow(ws, [c.owner, c.leads, c.markedEligible, c.markedOut], { 3: c.markedEligible ? VCOL[CANNOT] : null, 4: c.markedOut ? VCOL[ASSESS] : null }));
  await ws.commit();

  // ---------- 7. By nationality ----------
  ws = sheet(wb, "By nationality", [22, 10, 11, 11, 15, 15, 15, 17], { freeze: 3 });
  titleRow(ws, "By nationality", `Nationality is recorded on ${pct(R.completeness.Nationality, n)} of leads, so 'Not recorded' is shown as its own row rather than spread across the others.`);
  headerRow(ws, ["Nationality", "Leads", "% of leads", "Customers", "Australia: can", "Canada: can", "USA NIW: can", "Can't onboard anywhere"]);
  R.byNationality.forEach((g) => dataRow(ws, [g.key, g.leads, pct(g.leads, n), g.customers, pct(g.au, g.leads), pct(g.ca, g.leads), pct(g.us, g.leads), pct(g.none, g.leads)]));
  await ws.commit();

  // ---------- 8. By source ----------
  ws = sheet(wb, "By source", [46, 10, 11, 11, 15, 15, 15, 17], { freeze: 3 });
  titleRow(ws, "By source", "First by original source, then by the lead ad form or campaign they came through.");
  headerRow(ws, ["Original source", "Leads", "% of leads", "Customers", "Australia: can", "Canada: can", "USA NIW: can", "Can't onboard anywhere"]);
  R.bySource.forEach((g) => dataRow(ws, [g.key, g.leads, pct(g.leads, n), g.customers, pct(g.au, g.leads), pct(g.ca, g.leads), pct(g.us, g.leads), pct(g.none, g.leads)]));
  blank(ws);
  headerRow(ws, ["Form or campaign", "Leads", "% of leads", "Customers", "Australia: can", "Canada: can", "USA NIW: can", "Can't onboard anywhere"]);
  R.byForm.forEach((g) => dataRow(ws, [g.key, g.leads, pct(g.leads, n), g.customers, pct(g.au, g.leads), pct(g.ca, g.leads), pct(g.us, g.leads), pct(g.none, g.leads)]));
  await ws.commit();

  // ---------- 9. Can't tell ----------
  ws = sheet(wb, "Can't tell", [44, 10, 30], { freeze: 3 });
  titleRow(ws, "Job titles a person needs to read", "Too vague, not a job, or unreadable. HOF's criteria say assess these rather than reject them.");
  headerRow(ws, ["Job title", "Leads", "Why"]);
  R.cantTell.forEach((t) => dataRow(ws, [t.title, t.leads, t.why]));
  await ws.commit();

  // ---------- 10. All leads ----------
  ws = sheet(wb, "All leads", [24, 11, 26, 24, 14, 15, 9, 10, 13, 20, 9, 13, 16, 16, 16, 10, 46, 16, 26, 18, 8], { freeze: 1 });
  headerRow(ws, ["Name", "Created", "Job title", "Read as", "Kind", "Education", "Age", "Experience", "Nationality", "Lead stage", "Customer",
    "Program of interest", "Australia", "Canada", "USA NIW", "Can't onboard anywhere", "Main reason", "Source", "Form / campaign", "Owner", "HubSpot"]);
  for (const L of R.leads) {
    dataRow(ws, [L.f.name, day(L.f.created), L.f.rawTitle, L.a.occ.occupation || L.a.occ.title, L.a.occ.kind, L.edu, L.age, L.exp, L.f.nationality, L.f.stage,
      L.f.customer ? "Yes" : "", PROGRAM_NAME[L.f.interest] || "", L.a.au.v, L.a.ca.v, L.a.us.v, L.a.none ? "Yes" : "", L.reason, L.f.source, L.f.form || L.f.campaign, L.f.owner,
      { text: "Open", hyperlink: L.link }],
      { 13: VCOL[L.a.au.v], 14: VCOL[L.a.ca.v], 15: VCOL[L.a.us.v] });
  }
  await ws.commit();

  // ---------- 11. How it was checked ----------
  ws = sheet(wb, "How it was checked", [120]);
  titleRow(ws, "How this was checked");
  [
    `Period: ${R.periodText}. Every lead created in that time, read straight from HubSpot. Read-only — nothing in HubSpot was changed.`,
    "",
    "WHY NOT THE LEAD STAGE",
    "A consultant can mark any occupation eligible. So each lead is judged afresh from its recorded facts, and the result is compared with what was marked.",
    "",
    "THREE OUTCOMES, NOT TWO",
    "Can onboard — the occupation fits, and no recorded fact breaks a hard rule.",
    "Cannot onboard — a recorded fact clearly breaks a hard rule.",
    "Needs assessment — not enough is known. HOF's criteria say to assess a lead like this, not reject it. A missing fact never counts against a lead.",
    "",
    "THE HARD RULES",
    `Australia (189, 190, 491): must be under ${SETTINGS.AU_MAX_AGE}; the occupation must be on the MLTSSL, STSOL or ROL. Education under a degree and under 3 years' experience are never reasons to reject.`,
    `Canada (Express Entry, PNP): the occupation must be NOC TEER 0–3; at least ${SETTINGS.CA_MIN_EXPERIENCE} year of skilled experience; completed secondary education. Age is never a reason to reject on its own.`,
    `USA EB-2 NIW: Path 1 is a master's or higher, or a bachelor's with ${SETTINGS.US_PATH1_BACHELOR_YEARS}+ years. Below a bachelor's with under ${SETTINGS.US_PATH2_YEARS} years, neither path is realistic. Exceptional ability can't be judged from HubSpot, so it is always left to a person.`,
    "",
    "READING THE JOB TITLE",
    "Clients type their job title, so each one is read as a person would, into a standard occupation. Vague titles — Owner, Manager, Technician — are left unclear, because HOF's criteria say to judge duties, not titles.",
    "The reader is a first pass. Anything in occupation-decisions.csv overrides it, and the 'All occupations (review)' tab is there to build that file once.",
    "Only job titles are sent to the reader — never names, numbers or emails.",
    "",
    "READING THE FIELDS",
    "Every dropdown is read by its label, not its stored value. Age Range stores '46-50' for what the team sees as '41-45'; reading the stored value would wrongly put someone over 45.",
    "Where a form asked a question several ways, every version is checked: ten education fields, four age fields, two experience fields.",
    "",
    "WHO IS A CUSTOMER",
    "A lead with a deal in a service pipeline, or a sales deal at its won stage.",
    "",
    "WHAT IT CANNOT SEE",
    "Job duties, English level and exceptional ability are not recorded in HubSpot, so none of them can decide anything here.",
  ].forEach((l) => { const r = ws.addRow([l]); const head = /^[A-Z][A-Z ,]+$/.test(l); r.getCell(1).font = F({ bold: head, color: { argb: head ? NAVY : "FF3F4A5A" } }); r.getCell(1).alignment = { wrapText: true }; r.commit(); });
  await ws.commit();

  await wb.commit();
}

module.exports = { writeWorkbook };
