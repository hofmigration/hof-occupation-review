// review.js — the run. Read-only: nothing in HubSpot is changed.
const fs = require("fs");
const path = require("path");
const { SETTINGS } = require("./config");
const hub = require("./0-hubspot");
const F = require("./1-facts");
const C = require("./2-classify");
const { assessLead } = require("./3-assess");
const { writeWorkbook } = require("./4-workbook");
const { buildEmail, sendEmail } = require("./5-email");
const { aggregate, present } = require("./6-aggregate");

const OFF = SETTINGS.TZ_OFFSET_HOURS * 3600e3;
const dayStart = (s) => { const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) - OFF : null; };
const fmtDay = (t) => new Date(t + OFF).toISOString().slice(0, 10);

const FIELDS = ["firstname", "lastname", "createdate", "hubspot_owner_id", "lifecyclestage",
  SETTINGS.STAGE_FIELD, "hof_ineligible_reason", "reason_for_didnt_fill",
  ...SETTINGS.TITLE_FIELDS, ...SETTINGS.EDUCATION_FIELDS, ...Object.values(SETTINGS.AGE_FIELDS), ...Object.values(SETTINGS.EXPERIENCE_FIELDS),
  SETTINGS.NATIONALITY_FIELD, SETTINGS.RESIDENCE_FIELD, ...Object.values(SETTINGS.SOURCE_FIELDS)];

(async () => {
  if (!process.env.HUBSPOT_TOKEN) { console.log("!! No HUBSPOT_TOKEN secret."); process.exit(1); }
  try {
    const now = Date.now();
    const from = dayStart(SETTINGS.FROM_DATE);
    if (from == null) throw new Error(`The from date "${SETTINGS.FROM_DATE}" must be YYYY-MM-DD.`);
    const to = SETTINGS.TO_DATE ? Math.min((dayStart(SETTINGS.TO_DATE) ?? now) + 864e5, now) : now;
    if (to <= from) throw new Error("The to date is before the from date.");
    const periodText = `${fmtDay(from)} to ${fmtDay(to - 1)}`;
    console.log(`=== Occupation eligibility review — ${periodText} ===\n`);

    const labels = await hub.labelMaps([SETTINGS.STAGE_FIELD, SETTINGS.AGE_FIELDS.range, SETTINGS.EXPERIENCE_FIELDS.range,
      SETTINGS.NATIONALITY_FIELD, SETTINGS.RESIDENCE_FIELD, SETTINGS.SOURCE_FIELDS.source, ...SETTINGS.EDUCATION_FIELDS]);
    const owners = await hub.ownerNames();

    console.log("Finding customers (service pipelines and won deals)…");
    const cust = await hub.customers();
    console.log(`  ${cust.deals} deals, ${cust.map.size} customer contacts\n`);

    console.log("Reading leads…");
    const facts = [];
    let monthStart = from;
    while (monthStart < to) {
      const d = new Date(monthStart + OFF);
      const next = Math.min(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - OFF, to);
      const before = facts.length;
      await hub.searchAll("contacts", [], FIELDS, monthStart, next, (rs) => rs.forEach((c) => facts.push(F.facts(c, labels, owners, cust.map, now))));
      console.log(`  ${fmtDay(monthStart).slice(0, 7)}: ${facts.length - before} leads`);
      monthStart = next;
    }
    console.log(`  ${facts.length} leads in total\n`);

    // every distinct job title, read once
    const titles = new Map();
    facts.forEach((f) => f.titles.forEach((t) => titles.set(t, (titles.get(t) || 0) + 1)));
    const cache = C.loadCache();
    const decisions = C.loadDecisions();
    console.log(`Reading job titles (${titles.size} different; ${decisions.size} HOF decision(s) on file)…`);
    const stats = await C.classifyAll(titles, cache);
    if (stats.stopped) console.log(`  !! stopped early: ${stats.stopped}. ${stats.left} title(s) left for the next run.`);

    const memo = new Map();
    let decided = 0;
    const lookup = (t) => {
      if (memo.has(t)) return memo.get(t);
      const r = C.applyDecisions(t, cache[t] || C.UNREAD, decisions);
      if (r.decided) decided++;
      memo.set(t, r);
      return r;
    };

    const leads = facts.map((f) => present({ f, a: assessLead(f, lookup), link: hub.contactLink(f.id) }));
    const R = { ...aggregate(leads, { titles: titles.size, read: stats.read, cached: stats.cached, decided, left: stats.left, stopped: stats.stopped }), leads, periodText };

    console.log(`\n===== RESULT =====`);
    for (const k of ["au", "ca", "us"]) console.log(`  ${k.toUpperCase()}  can ${R.programs[k]["Can onboard"]}  cannot ${R.programs[k]["Cannot onboard"]}  needs assessment ${R.programs[k]["Needs assessment"]}`);
    console.log(`  Can't onboard for any program: ${R.noneCount}`);
    console.log(`  Marked eligible, rules say no: ${R.tabs.markedEligible.length}`);
    console.log(`  Marked out, could onboard:     ${R.tabs.markedOut.length}`);
    console.log(`  Customers with a failing profile: ${R.tabs.customers.length}`);

    fs.mkdirSync(SETTINGS.OUT_DIR, { recursive: true });
    const file = path.join(SETTINGS.OUT_DIR, `Occupation-review-${fmtDay(from)}-to-${fmtDay(to - 1)}.xlsx`);
    await writeWorkbook(file, R);
    const mb = fs.statSync(file).size / 1048576;
    console.log(`\nWrote ${file} (${mb.toFixed(1)} MB) — download it from this run's Artifacts.`);

    if (!SETTINGS.SEND_EMAIL) { console.log("Not emailed — send_email was false."); return; }
    const attach = mb <= SETTINGS.ATTACH_LIMIT_MB;
    const html = buildEmail(R, attach);
    fs.writeFileSync(path.join(SETTINGS.OUT_DIR, "summary.html"), html);
    const ok = await sendEmail(`Occupation review ${periodText}: ${R.tabs.markedEligible.length} marked eligible but not, ${R.tabs.markedOut.length} turned away but could onboard`,
      html, attach ? { filename: path.basename(file), content: fs.readFileSync(file).toString("base64") } : null);
    if (ok) console.log(`Emailed to ${SETTINGS.REPORT_TO}${attach ? " with the workbook attached" : " — the workbook is in Artifacts"}.`);
    else { console.log("!! Not emailed. The workbook is still in Artifacts."); process.exitCode = 1; }
  } catch (e) {
    console.error(`\nFAILED: ${e.message}`);
    process.exit(1);
  }
})();
