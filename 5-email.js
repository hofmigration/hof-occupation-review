// 5-email.js — the whole report, in the email body.
//
// Gmail cuts off any email over about 100 KB ("[Message clipped]"), which would hide the
// bottom of the report. So every section shows its top rows and says how many more are in
// the workbook, and if the email still comes out too big, it shrinks itself until it fits.
const { SETTINGS } = require("./config");
const { CAN, CANNOT, ASSESS, PROGRAM_NAME } = require("./3-assess");

const C = { navy: "#16205e", royal: "#1f2f8f", ink: "#1f2937", body: "#3f4a5a", soft: "#868e9b", line: "#e6e9f1", panel: "#f7f9fc",
  bad: "#b42318", badbg: "#fdecea", warn: "#9a5b0c", warnbg: "#fff5e8", good: "#1e7a4d", goodbg: "#e9f6ee" };
const FONT = "font-family:Arial,Helvetica,sans-serif";
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const num = (x) => Number(x || 0).toLocaleString("en-US");
const pct = (a, b) => (b ? `${Math.round((a / b) * 1000) / 10}%` : "—");
const cut = (s, n) => { const t = String(s || ""); return t.length > n ? t.slice(0, n - 1) + "…" : t; };

// compact cells: inline styles are repeated on every cell, so every byte counts
const TH = `style="padding:7px 8px;${FONT};font-size:10.5px;font-weight:bold;color:${C.navy};background:${C.panel};text-transform:uppercase;letter-spacing:.03em"`;
const td = (extra = "") => `style="padding:6px 8px;border-top:1px solid ${C.line};${FONT};font-size:12px;color:${C.ink};vertical-align:top${extra ? ";" + extra : ""}"`;
const R_ = (x) => `<td align="right" ${td()}>${x}</td>`;
const L_ = (x, extra) => `<td ${td(extra)}>${x}</td>`;
const table = (heads, rows) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.line};border-collapse:collapse">
<tr>${heads.map((h, i) => `<td ${i ? 'align="right" ' : ""}${TH}>${h}</td>`).join("")}</tr>${rows.join("")}</table>`;
const heading = (t, sub) => `<div style="${FONT};font-size:15px;font-weight:bold;color:${C.navy};margin:26px 0 ${sub ? 3 : 8}px">${t}</div>${sub ? `<div style="${FONT};font-size:12px;color:${C.soft};margin:0 0 9px;line-height:1.5">${sub}</div>` : ""}`;
const more = (shown, total, where) => total > shown ? `<div style="${FONT};font-size:11.5px;color:${C.soft};margin-top:6px">…and ${num(total - shown)} more in the workbook's <b>${where}</b> tab.</div>` : "";
const VW = { [CAN]: [C.good, "Can"], [CANNOT]: [C.bad, "Cannot"], [ASSESS]: [C.warn, "Assess"] };
const OCCV = { eligible: ["Eligible", C.good], not_eligible: ["Not eligible", C.bad], unclear: ["Unclear", C.warn], plausible: ["Plausible", C.good], unlikely: ["Unlikely", C.bad] };
const occCell = (v) => `<td align="right" ${td(`color:${OCCV[v][1]}`)}>${OCCV[v][0]}</td>`;
const nameLink = (L) => `<a href="${esc(L.link)}" style="color:${C.royal};text-decoration:none">${esc(cut(L.f.name, 30))}</a>`;

const FULL = { occ: 25, rows: 12, cust: 25, cons: 10, forms: 10, tell: 15 };

function buildEmail(R, attached, caps = FULL) {
  const n = R.leads.length;
  const tile = (v, l, fg, bg) => `<td width="25%" align="center" style="background:${bg};border-radius:6px;padding:12px 5px"><div style="${FONT};font-size:21px;font-weight:bold;color:${fg}">${esc(v)}</div><div style="${FONT};font-size:9.5px;font-weight:bold;letter-spacing:.04em;text-transform:uppercase;color:${fg};margin-top:5px">${esc(l)}</div></td>`;

  // ---- by program ----
  const prog = table(["Program", "Can onboard", "Cannot", "Needs assessment"], ["au", "ca", "us"].map((k) => {
    const c = R.programs[k];
    return `<tr>${L_(`<b>${PROGRAM_NAME[k]}</b>`)}${["Can onboard", "Cannot onboard", "Needs assessment"].map((v, i) =>
      `<td align="right" ${td(`color:${[C.good, C.bad, C.warn][i]};font-weight:bold`)}>${num(c[v])} <span style="color:${C.soft};font-weight:normal">${pct(c[v], n)}</span></td>`).join("")}</tr>`;
  }));

  // ---- occupations we can't onboard ----
  const occAll = R.occupations.filter((o) => o.cantSome);
  const occ = occAll.slice(0, caps.occ).map((o) => `<tr>${L_(`${o.cantAny ? "<b>" : ""}${esc(cut(o.name, 40))}${o.cantAny ? "</b>" : ""}`)}${R_(num(o.leads))}${occCell(o.au)}${occCell(o.ca)}${occCell(o.us)}</tr>`);

  // ---- the mismatches ----
  const byProgram = (list, pick) => ["us", "ca", "au"].map((k) => [k, list.filter((L) => pick(L).includes(k)).length]).filter(([, c]) => c);
  const me = R.tabs.markedEligible, mo = R.tabs.markedOut, cu = R.tabs.customers;
  const meCounts = byProgram(me, (L) => [L.a.markedEligibleButNot.program]).map(([k, c]) => `${PROGRAM_NAME[k]} <b>${num(c)}</b>`).join(" · ");
  const moStages = [...new Set(mo.map((L) => L.f.stage))].map((st) => `${esc(st)} <b>${num(mo.filter((L) => L.f.stage === st).length)}</b>`).join(" · ");
  const meRows = me.slice(0, caps.rows).map((L) => `<tr>${L_(nameLink(L))}${L_(PROGRAM_NAME[L.a.markedEligibleButNot.program])}${L_(esc(cut(L.a.markedEligibleButNot.why, 70)), `color:${C.bad}`)}${L_(esc(cut(L.f.owner, 22)))}</tr>`);
  const moRows = mo.slice(0, caps.rows).map((L) => `<tr>${L_(nameLink(L))}${L_(L.a.markedOutButEligible.programs.map((k) => PROGRAM_NAME[k]).join(", "))}${L_(esc(cut(L.a.markedOutButEligible.why, 70)), `color:${C.good}`)}${L_(esc(cut(L.f.owner, 22)))}</tr>`);
  const cuRows = cu.slice(0, caps.cust).map((L) => `<tr>${L_(nameLink(L))}${L_(PROGRAM_NAME[L.a.customerIneligible.program])}${L_(esc(cut(L.a.customerIneligible.why, 80)), `color:${C.bad}`)}${L_(esc(cut(L.f.owner, 22)))}</tr>`);
  const cons = (R.byConsultant || []).slice(0, caps.cons).map((c) => `<tr>${L_(esc(cut(c.owner, 30)))}${R_(num(c.leads))}<td align="right" ${td(c.markedEligible ? `color:${C.bad};font-weight:bold` : "")}>${num(c.markedEligible)}</td><td align="right" ${td(c.markedOut ? `color:${C.warn};font-weight:bold` : "")}>${num(c.markedOut)}</td></tr>`);

  // ---- groups ----
  const grp = (g) => `<tr>${L_(esc(cut(g.key, 40)))}${R_(num(g.leads))}${R_(pct(g.leads, n))}${R_(pct(g.au, g.leads))}${R_(pct(g.ca, g.leads))}${R_(pct(g.us, g.leads))}<td align="right" ${td(`color:${C.bad}`)}>${pct(g.none, g.leads)}</td></tr>`;
  const natRows = R.byNationality.map(grp);
  const srcRows = R.bySource.map(grp);
  const formRows = R.byForm.slice(0, caps.forms).map(grp);
  const tell = R.cantTell.slice(0, caps.tell).map((t) => `<tr>${L_(esc(cut(t.title, 45)))}${R_(num(t.leads))}${L_(esc(t.why), `color:${C.soft}`)}</tr>`);
  const comp = Object.entries(R.completeness).map(([k, v]) => `${esc(k)} <b>${pct(v, n)}</b>`).join(" · ");
  const GH = ["Group", "Leads", "Share", "AU: can", "CA: can", "US: can", "None"];

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef1f6;padding:24px 8px"><tr><td align="center">
<table role="presentation" width="700" cellpadding="0" cellspacing="0" border="0" style="width:700px;max-width:700px;background:#fff;border-radius:8px;overflow:hidden">
<tr><td style="background-color:${C.navy};background-image:linear-gradient(120deg,${C.navy},${C.royal});padding:22px 24px">
<div style="${FONT};font-size:20px;font-weight:bold;color:#fff">Occupation eligibility review</div>
<div style="${FONT};font-size:12.5px;color:#aab0d4;margin-top:5px">${esc(R.periodText)} · ${num(n)} leads, judged from what HubSpot holds rather than the Lead Stage</div>
</td></tr>
<tr><td style="padding:20px 24px">

<table role="presentation" width="100%" cellspacing="8" style="margin:0 -8px 12px"><tr>
${tile(num(n), "leads reviewed", C.navy, C.panel)}${tile(pct(R.noneCount, n), "can't onboard anywhere", C.bad, C.badbg)}
${tile(num(me.length), "marked eligible, rules say no", C.bad, C.badbg)}${tile(num(mo.length), "turned away, could onboard", C.warn, C.warnbg)}
</tr></table>

${cu.length ? `<table role="presentation" width="100%" style="margin:0 0 6px"><tr><td style="background:${C.badbg};border-left:4px solid ${C.bad};padding:11px 14px;${FONT};font-size:13px;line-height:1.55;color:${C.bad}"><b>${num(cu.length)} customers</b> have a recorded profile that fails the criteria for the program they bought. They're listed below — check these first.</td></tr></table>` : ""}

${heading("By program", `"Needs assessment" means HubSpot doesn't hold enough to decide. HOF's criteria say to assess these, not reject them.`)}
${prog}

${occ.length ? heading("Occupations we can't onboard", "For at least one program, judged on the occupation alone. <b>Bold</b> means no program at all. Most leads first.") + table(["Occupation", "Leads", "Australia", "Canada", "USA NIW"], occ) + more(occ.length, occAll.length, "Occupations we can't onboard") : ""}

${me.length ? heading(`Marked eligible, but the rules say no — ${num(me.length)}`, `Leads taken forward that HOF's criteria would not accept. ${meCounts}.`) + table(["Lead", "Marked for", "Why the rules say no", "Consultant"], meRows) + more(meRows.length, me.length, "Marked eligible, rules say no") : ""}

${mo.length ? heading(`Turned away, but could be onboarded — ${num(mo.length)}`, `Marked Ineligible or Occupation Not Listed, yet they fit at least one program. ${moStages}.`) + table(["Lead", "Could onboard for", "Why", "Consultant"], moRows) + more(moRows.length, mo.length, "Marked out, could onboard") : ""}

${cons.length ? heading("By consultant", "Where each consultant's markings and the rules disagree. A high number is a pattern worth a conversation, not proof on its own.") + table(["Consultant", "Leads owned", "Eligible, rules say no", "Turned away, could onboard"], cons) + more(cons.length, R.byConsultant.length, "By consultant") : ""}

${cu.length ? heading(`Customers whose profile fails — ${num(cu.length)}`, "Clients already taken on. The risk here is refunds and complaints.") + table(["Customer", "Customer for", "Why it fails", "Consultant"], cuRows) + more(cuRows.length, cu.length, "Customers — ineligible profile") : ""}

${heading("By nationality", `Nationality is recorded on ${pct(R.completeness.Nationality, n)} of leads, so <b>Not recorded</b> is its own row. "Can" columns are the share that could be onboarded; "None" is the share that can't be onboarded anywhere.`)}
${table(GH.map((h, i) => (i ? h : "Nationality")), natRows)}

${heading("By source")}
${table(GH.map((h, i) => (i ? h : "Original source")), srcRows)}
${formRows.length ? `<div style="height:10px"></div>` + table(GH.map((h, i) => (i ? h : "Form or campaign")), formRows) + more(formRows.length, R.byForm.length, "By source") : ""}

${tell.length ? heading("Job titles a person needs to read", "Too vague, not a job, or unreadable. Most common first.") + table(["Job title", "Leads", "Why"], tell) + more(tell.length, R.cantTell.length, "Can't tell") : ""}

<div style="${FONT};font-size:12px;color:${C.body};margin-top:24px;padding-top:14px;border-top:1px solid ${C.line};line-height:1.65">
<b>How complete the data is:</b> ${comp}.<br>
${R.reader.left ? `<span style="color:${C.warn}"><b>${num(R.reader.left)} job titles weren't read this run</b> (${esc(R.reader.stopped || "quota")}), so their leads count as needing assessment. Run it again — titles already read are kept.</span><br>` : ""}
<b>How it was judged:</b> Australia — under 45, occupation on the 189/190/491 lists. Canada — TEER 0–3, at least a year's experience. USA NIW — a master's, or a bachelor's with 5+ years. A missing fact never counts against a lead. Every dropdown is read by what the team sees, not its stored value. Only job titles were sent to the AI reader.
</div>
<div style="${FONT};font-size:12px;color:${C.soft};margin-top:12px">${attached ? "The full workbook is attached" : "The full workbook is too big to attach — it's in this run's Artifacts on GitHub"}, with every lead and a HubSpot link for each.</div>
</td></tr>
<tr><td style="background:${C.panel};border-top:1px solid ${C.line};padding:14px 24px;${FONT};font-size:11.5px;color:${C.soft}"><b style="color:${C.body}">Ali Raza</b> · Compliance · HOF Migration<br>Read-only. Nothing in HubSpot was changed.</td></tr>
</table></td></tr></table>`;
}

// Shrink the row counts until the email fits under Gmail's clipping limit.
const LIMIT = 95 * 1024;
function fitEmail(R, attached) {
  const steps = [FULL, { occ: 15, rows: 8, cust: 15, cons: 8, forms: 6, tell: 10 }, { occ: 10, rows: 5, cust: 10, cons: 5, forms: 4, tell: 6 }, { occ: 6, rows: 3, cust: 6, cons: 3, forms: 3, tell: 3 }];
  let html = "";
  for (const caps of steps) { html = buildEmail(R, attached, caps); if (Buffer.byteLength(html) <= LIMIT) return { html, caps, bytes: Buffer.byteLength(html) }; }
  return { html, caps: steps[steps.length - 1], bytes: Buffer.byteLength(html) };
}

async function sendEmail(subject, html, attachment) {
  if (!process.env.RESEND_KEY) { console.log("!! No RESEND_KEY — not emailed."); return false; }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: SETTINGS.FROM_EMAIL, to: [SETTINGS.REPORT_TO], subject, html, attachments: attachment ? [attachment] : undefined }),
  });
  if (!res.ok) { console.log(`Email failed: ${res.status} ${(await res.text()).slice(0, 200)}`); return false; }
  return true;
}

module.exports = { buildEmail, fitEmail, sendEmail, LIMIT };
