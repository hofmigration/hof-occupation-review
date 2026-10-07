// 0-hubspot.js — reading HubSpot. Nothing is ever written.
const { SETTINGS } = require("./config");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let last = 0;

async function hs(method, path, body, attempt = 0) {
  const wait = last + 1000 / SETTINGS.HUBSPOT_RPS - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  let res;
  try {
    res = await fetch(`https://api.hubapi.com${path}`, {
      method, headers: { Authorization: `Bearer ${process.env.HUBSPOT_TOKEN}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    if (attempt < 5) { await sleep(2000 * (attempt + 1)); return hs(method, path, body, attempt + 1); }
    throw new Error(`Could not reach HubSpot: ${e.message}`);
  }
  if ((res.status === 429 || res.status >= 500) && attempt < 7) { await sleep(2500 * (attempt + 1)); return hs(method, path, body, attempt + 1); }
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 160)}`);
  return text ? JSON.parse(text) : null;
}

// Every record matching `filters` with createdate in [from, to). HubSpot will not page past
// 10,000 results in one search, so a window that is too big is halved until each part fits.
async function searchAll(objectType, filters, properties, from, to, onPage, depth = 0) {
  const group = (f, t) => [{ filters: [...filters,
    { propertyName: "createdate", operator: "GTE", value: String(f) },
    { propertyName: "createdate", operator: "LT", value: String(t) }] }];
  const probe = await hs("POST", `/crm/v3/objects/${objectType}/search`, { filterGroups: group(from, to), properties: ["createdate"], limit: 1 });
  const total = probe.total || 0;
  if (!total) return 0;
  if (total > 9800 && depth < 14 && to - from > 3600e3) {
    const mid = Math.floor((from + to) / 2);
    return (await searchAll(objectType, filters, properties, from, mid, onPage, depth + 1)) +
           (await searchAll(objectType, filters, properties, mid, to, onPage, depth + 1));
  }
  let after, got = 0;
  for (let i = 0; i < 120; i++) {
    const r = await hs("POST", `/crm/v3/objects/${objectType}/search`, {
      filterGroups: group(from, to), sorts: [{ propertyName: "createdate", direction: "ASCENDING" }],
      properties, limit: 100, after,
    });
    const results = r.results || [];
    got += results.length;
    onPage(results);
    after = r.paging && r.paging.next && r.paging.next.after;
    if (!after) break;
  }
  if (got < total) console.log(`  !! expected ${total} in a window but read ${got}`);
  return got;
}

// The label each stored value is shown as. Several HOF fields store one thing and show
// another — Age Range stores "46-50" for what the team sees as "41-45" — so labels are
// always what gets read.
async function labelMaps(properties) {
  const maps = {};
  for (const p of properties) {
    try {
      const r = await hs("GET", `/crm/v3/properties/contacts/${p}`);
      if ((r.options || []).length) maps[p] = Object.fromEntries(r.options.map((o) => [o.value, o.label]));
    } catch { /* free-text fields have no options */ }
  }
  return maps;
}

async function ownerNames() {
  const map = {}; let after;
  try {
    for (let i = 0; i < 20; i++) {
      const r = await hs("GET", `/crm/v3/owners?limit=500${after ? `&after=${after}` : ""}`);
      (r.results || []).forEach((o) => { map[o.id] = `${o.firstName || ""} ${o.lastName || ""}`.trim() || o.email || o.id; });
      after = r.paging && r.paging.next && r.paging.next.after;
      if (!after) break;
    }
  } catch { /* names are a nicety */ }
  return map;
}

// contact id -> { programs: Set("us" | "ca" | "au" | "ca/au" | "other") }
async function customers() {
  const deals = [];
  const take = (rs) => rs.forEach((d) => deals.push(d));
  const props = ["pipeline", "dealstage", "dealname"];
  const start = Date.UTC(2018, 0, 1), end = Date.now() + 864e5;
  await searchAll("deals", [{ propertyName: "pipeline", operator: "IN", values: Object.keys(SETTINGS.SERVICE_PIPELINES) }], props, start, end, take);
  await searchAll("deals", [{ propertyName: "dealstage", operator: "IN", values: Object.keys(SETTINGS.WON_STAGES) }], props, start, end, take);

  const programOf = (d) => {
    const p = d.properties || {};
    let prog = SETTINGS.SERVICE_PIPELINES[p.pipeline] || SETTINGS.WON_STAGES[p.dealstage] || "other";
    if (prog === "ca/au") {           // the deal name usually says which: "Name - CAN", "Name - AUS"
      const n = String(p.dealname || "").toLowerCase();
      if (/\b(aus|australia)\b/.test(n)) prog = "au"; else if (/\b(can|canada)\b/.test(n)) prog = "ca";
    }
    return prog;
  };

  const byDeal = new Map(deals.map((d) => [String(d.id), programOf(d)]));
  const ids = [...byDeal.keys()];
  const map = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const r = await hs("POST", "/crm/v4/associations/deals/contacts/batch/read", { inputs: ids.slice(i, i + 100).map((id) => ({ id })) });
    for (const row of r.results || []) {
      const prog = byDeal.get(String(row.from && row.from.id));
      for (const to of row.to || []) {
        const c = String(to.toObjectId);
        if (!map.has(c)) map.set(c, new Set());
        map.get(c).add(prog);
      }
    }
  }
  return { map, deals: deals.length };
}

const contactLink = (id) => `https://app.hubspot.com/contacts/${SETTINGS.PORTAL_ID}/record/0-1/${id}`;

module.exports = { hs, searchAll, labelMaps, ownerNames, customers, contactLink };
