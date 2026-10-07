# Occupation eligibility review

Judges every lead since a chosen date against **HOF's onboarding criteria**, from what
HubSpot actually holds — occupation, age, education, experience — **instead of trusting the
Lead Stage**, which anyone can set by hand. Then it compares the two.

Read-only. Nothing in HubSpot is changed. Only job titles go to the AI reader — never
names, numbers or emails.

---

## Setting it up

New **private** repo, e.g. `hof-occupation-review`. Upload everything to the root,
including the `cache` folder with `titles.json` inside it, and `occupation-review.yml` to
`.github/workflows/`.

| Secret | |
|---|---|
| `HUBSPOT_TOKEN` | the same token as your other agents |
| `GEMINI_KEY` | reads the job titles |
| `GEMINI_KEY_2` | optional — a second key used in turn, so twice as many titles get read per run |
| `RESEND_KEY` | for the email — from the Resend account registered with your address |

## Running it

**Actions → Occupation eligibility review → Run workflow.** From date `2025-01-01`, to
date blank for today.

**The first run will probably not read every job title.** There may be tens of thousands
of different ones since January 2025. Titles are read most-common-first, so even a partial
run covers most leads, and anything not yet read counts as *needs assessment* — never as a
rejection. **Run it again** and it carries on: every title read is saved in
`cache/titles.json`, and is never read twice. After two or three runs, all titles are known
and each later run only reads new ones.

---

## Three outcomes, not two

| | Means |
|---|---|
| **Can onboard** | the occupation fits, and no recorded fact breaks a hard rule |
| **Cannot onboard** | a recorded fact clearly breaks a hard rule |
| **Needs assessment** | HubSpot doesn't hold enough to decide |

HOF's own criteria say to assess unclear cases rather than reject them, so **a missing fact
never counts against a lead**. Only a recorded one can.

## The hard rules

**Australia (189, 190, 491):** under 45; the occupation on the MLTSSL, STSOL or ROL.
Education below a degree and under 3 years' experience are never reasons to reject.

**Canada (Express Entry, PNP):** the occupation NOC TEER 0–3; at least 1 year of skilled
experience; completed secondary education. Age is never a reason to reject on its own.

**USA EB-2 NIW:** Path 1 is a master's or higher, or a bachelor's with 5+ years. Below a
bachelor's with under 10 years, neither path is realistic. Exceptional ability can't be
judged from HubSpot, so it is always left to a person.

---

## The workbook

| Tab | Answers |
|---|---|
| **Summary** | each program's can / cannot / needs assessment, and how complete the data is |
| **Occupations we can't onboard** | each occupation, how many leads, and for which programs |
| **All occupations (review)** | every occupation, to review once — see below |
| **Marked eligible, rules say no** | Waleed's question: leads taken forward that the criteria say no to |
| **Marked out, could onboard** | leads turned away that fit at least one program |
| **Customers — ineligible profile** | clients already taken on whose profile fails — check these first |
| **By consultant** | where each consultant's markings and the rules disagree |
| **By nationality** · **By source** | counts, percentages, and how each group fares |
| **Can't tell** | job titles too vague or unreadable to judge |
| **All leads** | every lead, with its verdict for each program and a HubSpot link |
| **How it was checked** | the rules and the limits |

**The email carries the whole report in its body** — every section above, each with its
top rows and a count of how many more are in the workbook, and every lead linked to HubSpot.

Gmail cuts off emails over about 100 KB, which would hide the bottom of the report. So the
email checks its own size and, if it's ever too big, shows fewer rows per section until it
fits. A test with 20,000 leads came to 56 KB without needing to shrink.

If the workbook is small enough it's attached; otherwise it's under **Artifacts** on the run.

---

## Making the occupation list HOF's own

The AI reader is a **first pass**. Its judgement of whether an occupation is on Australia's
lists, or its NOC TEER, can be wrong — and HOF's practice may differ from the official list.

So **HOF has the last word**. In `occupation-decisions.csv`, one line per occupation:

```
title,australia,canada,usa_niw,note
chef,eligible,eligible,unlikely,Reviewed by Waleed
steel detailer,not eligible,eligible,unlikely,
sales executive,not eligible,eligible,unlikely,
```

- **title** — the *Decision key* from the *All occupations (review)* tab. An occupation name
  like `chef` covers every title read as Chef: *executive chef*, *head chef*, *cook*…
- each program: `eligible`, `not eligible`, or `unclear`. Leave it blank to keep the reader's view.

Every future run uses these decisions over the reader. Review the *All occupations* tab once,
correct what's wrong, and from then on the same occupation is always judged the same way —
which is exactly what Waleed asked for.

---

## What it can't see — worth knowing before acting on a row

**Job duties.** HOF's criteria say to judge the occupation by its duties, not its title.
HubSpot only holds the title the client typed, so vague titles — *Owner*, *Manager*,
*Technician* — are left for a person.

**English level.** There's no English field in HubSpot, so English never decides anything.

**Nationality** is filled in on only a minority of leads. *By nationality* shows
**Not recorded** as its own row rather than spreading it across the others. Nationality is
never guessed from names.

**Fields that store one thing and show another.** *Age Range* stores `46-50` for what the
team sees as **41–45**, and *Education Level* stores `Other` for **Diploma**. The review
always reads what the team sees — otherwise a 41–45-year-old would be wrongly rejected for
Australia.

## Changing a rule

Everything is in `config.js` in plain words. Every rule has a test in `selftest.js` —
`81 passed, 0 failed` — which runs before each review, so a broken rule stops the run.
