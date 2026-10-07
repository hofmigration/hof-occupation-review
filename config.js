// config.js — Occupation eligibility review. SAFE TO EDIT.
//
// Judges every lead from what HubSpot actually holds about them — occupation, age,
// education, experience — against HOF's onboarding criteria, instead of trusting the
// manually chosen Lead Stage. Then compares the two.
//
// The criteria are HOF's own (Australia and Canada from Haris, USA NIW from the two
// EB-2 paths). Where a criterion says "assess, don't reject", the bot does exactly that:
// it only says "can't onboard" when a recorded fact clearly fails a hard rule.

const SETTINGS = {
  // ---- the period ----
  FROM_DATE: process.env.FROM_DATE || "2025-01-01",
  TO_DATE: process.env.TO_DATE || "",            // blank = today
  TZ_OFFSET_HOURS: 5,

  // ---- where each fact lives. The first field with a usable value wins. ----
  // The consultant's own Occupation field comes first: when a consultant has filled it,
  // it is usually more reliable than what the client typed in the ad form.
  TITLE_FIELDS: ["occupation", "jobtitle", "current_job_occupation", "your_occupation_sector", "job_function"],
  // Consultant-set Education Level first, then every lead-ad version of the question.
  EDUCATION_FIELDS: ["education_level", "what_is_your_highest_level_of_education_", "what_is_your_highest_level_of_education",
    "what_is_your_highest_education_level_", "what_is_your_highest_education_level", "what_is_your_education_level_",
    "what_is_your_education_level", "education_bba_mba_hscother", "what_is_your_qualification_",
    "current_qualification_bba_mba_2_years_diploma_etc"],
  AGE_FIELDS: { exact: "age", dob: "date_of_birth", text: "what_is_your_age", range: "age_range" },
  EXPERIENCE_FIELDS: { range: "years_of_experience_new", text: "years_of_experience" },
  NATIONALITY_FIELD: "nationality",
  RESIDENCE_FIELD: "country_of_residence",
  STAGE_FIELD: "lead_stage",
  SOURCE_FIELDS: { source: "hs_analytics_source", campaign: "hs_analytics_source_data_2", form: "first_conversion_event_name" },

  // ---- what the Lead Stage says ----
  MARKED_ELIGIBLE: { "USA NIW": "us", "Qualified": "ca", "Qualified AUS": "au" },   // stored values
  MARKED_INELIGIBLE: ["Ineligible", "Occupation Not Listed"],

  // ---- who became a customer ----
  // A deal in a service pipeline, or a sales deal at its won stage.
  SERVICE_PIPELINES: {
    "26920574": "ca/au",   // HOF Service Pipeline - Canada & AUS
    "149481597": "us",     // HOF Service Pipeline (USA NIW)
    "62098241": "other", "818967055": "other", "818967057": "other", "647720619": "other", "107223591": "other",
  },
  WON_STAGES: {
    "60994706": "ca/au",   // HOF Sales Pipeline - Canada & AUS: Payment Made/Deal Won
    "947690588": "us",     // USA NIW Sales Pipeline: Payment Made/Deal Won
    "178346506": "other", "953907002": "other", "1209885800": "other", "1209280120": "other", "179262216": "other",
  },

  // ---- the hard rules (from HOF's criteria) ----
  AU_MAX_AGE: 45,              // Australia: must be under 45
  CA_NO_AGE_POINTS: 47,        // Canada: age alone is never a reason to reject; noted only
  CA_MIN_EXPERIENCE: 1,        // Canada FSW: at least 1 year skilled experience
  US_PATH1_BACHELOR_YEARS: 5,  // NIW Path 1: bachelor's + 5 years progressive experience
  US_PATH2_YEARS: 10,          // NIW Path 2: 10 years is one of the six exceptional-ability criteria

  // ---- the reader of job titles ----
  AI_MODELS: ["gemini-flash-lite-latest", "gemini-flash-latest", "gemini-2.5-flash-lite", "gemini-2.5-flash"],
  TITLES_PER_REQUEST: 100,
  MAX_AI_REQUESTS: Number(process.env.MAX_AI_REQUESTS || 400),   // per run; the cache carries on next time
  CACHE_FILE: "cache/titles.json",
  DECISIONS_FILE: "occupation-decisions.csv",   // HOF's own decisions, which override the reader

  // ---- the report ----
  REPORT_TO: process.env.REPORT_TO || "razaali@hofmigration.com",
  FROM_EMAIL: process.env.FROM_EMAIL || "onboarding@resend.dev",
  SEND_EMAIL: String(process.env.SEND_EMAIL || "true").toLowerCase() !== "false",
  ATTACH_LIMIT_MB: 18,
  OUT_DIR: "out",
  PORTAL_ID: "23735726",
  HUBSPOT_RPS: 4,
};

module.exports = { SETTINGS };
