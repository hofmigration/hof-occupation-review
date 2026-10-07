// 5-email.js — the summary in the email body; everything else in the Excel file.
const { SETTINGS } = require("./config");
const { CAN, CANNOT, ASSESS, PROGRAM_NAME } = require("./3-assess");
const C = { navy: "#16205e", royal: "#1f2f8f", ink: "#1f2937", body: "#3f4a5a", soft: "#868e9b", line: "#e6e9f1", panel: "#f7f9fc",
  bad: "#b42318", badbg: "#fdecea", warn: "#9a5b0c", warnbg: "#fff5e8", good: "#1e7a4d", goodbg: "#e9f6ee" };
const Fn = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const num = (x) => Number(x || 0).toLocaleString("en-US");
const pct = (a, b) => (b ? `${Math.round((a / b) * 1000) / 10}%` : "—");
const TH = `padding:8px 10px;font:700 10.5px/1.3 ${Fn};letter-spacing:.04em;text-transform:uppercase;color:${C.navy};background:${C.panel}`;
const TD = `padding:8px 10px;border-top:1px solid ${C.line};font:400 12.5px/1.4 ${Fn};color:${C.ink}`;
const OCCV = { eligible: ["Eligible", C.good], not_eligible: ["Not eligible", C.bad], unclear: ["Unclear", C.warn], plausible: ["Plausible", C.good], unlikely: ["Unlikely", C.bad] };

function buildEmail(R, attached) {
  const n = R.leads.length;
  const tile = (v, l, fg, bg) => `<td width="25%" align="center" style="background:${bg};border-radius:6px;padding:13px 6px"><div style="font:700 21px/1 ${Fn};color:${fg}">${esc(v)}</div><div style="font:600 9.5px/1.3 ${Fn};letter-spacing:.05em;text-transform:uppercase;color:${fg};margin-top:6px">${esc(l)}</div></td>`;
  const prog = ["au", "ca", "us"].map((k) => { const c = R.programs[k]; return `<tr>
    <td style="${TD};font-weight:600">${PROGRAM_NAME[k]}</td>
    <td align="right" style="${TD};color:${C.good};font-weight:700">${num(c[CAN])} <span style="color:${C.soft};font-weight:400">(${pct(c[CAN], n)})</span></td>
    <td align="right" style="${TD};color:${C.bad};font-weight:700">${num(c[CANNOT])} <span style="color:${C.soft};font-weight:400">(${pct(c[CANNOT], n)})</span></td>
    <td align="right" style="${TD};color:${C.warn};font-weight:700">${num(c[ASSESS])} <span style="color:${C.soft};font-weight:400">(${pct(c[ASSESS], n)})</span></td></tr>`; }).join("");
  const occ = R.occupations.filter((o) => o.cantAny).slice(0, 12).map((o) => `<tr>
    <td style="${TD}">${esc(o.name)}</td><td align="right" style="${TD};font-weight:700">${num(o.leads)}</td>
    ${["au", "ca", "us"].map((k) => `<td align="right" style="${TD};color:${OCCV[o[k]][1]}">${OCCV[o[k]][0]}</td>`).join("")}</tr>`).join("");
  const comp = Object.entries(R.completeness).map(([k, v]) => `${esc(k)} ${pct(v, n)}`).join(" · ");

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef1f6;padding:26px 10px"><tr><td align="center">
<table role="presentation" width="680" cellpadding="0" cellspacing="0" border="0" style="width:680px;max-width:680px;background:#fff;border-radius:8px;overflow:hidden">
<tr><td style="background-color:${C.navy};background-image:linear-gradient(120deg,${C.navy},${C.royal});padding:22px 26px">
  <div style="font:700 20px/1.3 ${Fn};color:#fff">Occupation eligibility review</div>
  <div style="font:400 12.5px/1.5 ${Fn};color:#aab0d4;margin-top:5px">${esc(R.periodText)} · ${num(n)} leads, judged from what HubSpot holds</div>
</td></tr>
<tr><td style="padding:22px 26px">
  <table role="presentation" width="100%" cellspacing="8" style="margin:0 -8px 14px"><tr>
    ${tile(num(n), "leads reviewed", C.navy, C.panel)}
    ${tile(pct(R.noneCount, n), "can't onboard anywhere", C.bad, C.badbg)}
    ${tile(num(R.tabs.markedEligible.length), "marked eligible, rules say no", C.bad, C.badbg)}
    ${tile(num(R.tabs.markedOut.length), "turned away, could onboard", C.warn, C.warnbg)}
  </tr></table>
  ${R.tabs.customers.length ? `<table role="presentation" width="100%" style="margin:0 0 14px"><tr><td style="background:${C.badbg};border-left:4px solid ${C.bad};padding:12px 15px;font:400 13.5px/1.6 ${Fn};color:${C.bad}"><b>${num(R.tabs.customers.length)} customers</b> have a recorded profile that fails the criteria for the program they bought. Those are the first ones to check — the risk is refunds and complaints.</td></tr></table>` : ""}
  <div style="font:700 14px/1.3 ${Fn};color:${C.navy};margin:18px 0 8px">By program</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.line};border-collapse:collapse">
    <tr><td style="${TH}">Program</td><td align="right" style="${TH}">Can onboard</td><td align="right" style="${TH}">Cannot</td><td align="right" style="${TH}">Needs assessment</td></tr>${prog}</table>
  ${occ ? `<div style="font:700 14px/1.3 ${Fn};color:${C.navy};margin:20px 0 8px">Occupations we can't onboard for any program, most leads first</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.line};border-collapse:collapse">
    <tr><td style="${TH}">Occupation</td><td align="right" style="${TH}">Leads</td><td align="right" style="${TH}">Australia</td><td align="right" style="${TH}">Canada</td><td align="right" style="${TH}">USA NIW</td></tr>${occ}</table>` : ""}
  <div style="font:400 12.5px/1.65 ${Fn};color:${C.body};margin-top:18px">
    <b>"Needs assessment"</b> means HubSpot doesn't hold enough to decide — HOF's criteria say to assess these, not reject them. A missing fact never counts against a lead.
  </div>
  <div style="font:400 12px/1.6 ${Fn};color:${C.soft};margin-top:10px">How complete the data is: ${comp}.</div>
  ${R.reader.left ? `<div style="font:400 12.5px/1.6 ${Fn};color:${C.warn};margin-top:10px">${num(R.reader.left)} job titles weren't read this run (${esc(R.reader.stopped || "quota")}), so their leads count as needing assessment. Run it again — titles already read are kept.</div>` : ""}
  <div style="font:400 12.5px/1.6 ${Fn};color:${C.soft};margin-top:14px">${attached ? "The full workbook is attached" : "The full workbook is too big to attach — it's in this run's Artifacts on GitHub"}, with one tab per question: occupations we can't onboard, marked eligible but not, turned away but could onboard, customers to check, nationality, source, and every lead.</div>
</td></tr>
<tr><td style="background:${C.panel};border-top:1px solid ${C.line};padding:15px 26px;font:400 11.5px/1.6 ${Fn};color:${C.soft}"><strong style="color:${C.body}">Ali Raza</strong> · Compliance · HOF Migration<br>Read-only. Nothing in HubSpot was changed.</td></tr>
</table></td></tr></table>`;
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

module.exports = { buildEmail, sendEmail };
