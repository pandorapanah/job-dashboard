import { EXAMPLE_MARKER } from "./paths.mjs";
import { dateInTimeZone, splitTimestamp } from "./format.mjs";

const DATE_STATUSES = ["مهلت گذشته", "مهلت امروز", "مهلت آینده", "نامشخص"];

const TOP_LEVEL_KEYS = [
  "schema_version",
  "schema_name",
  "timezone",
  "report_date",
  "generated_at",
  "language",
  "tone_note_fa",
  "privacy",
  "scope_note_fa",
  "aggregates",
  "counting_definitions",
  "next_actions",
  "public_vacancies_note_fa",
  "public_vacancies",
  "vacancy_date_status_notes_fa",
  "publication",
];

const PRIVACY_KEYS = [
  "person_identity_included",
  "vacancy_library_states_any_application_was_made",
  "screening_questions_or_answers_included",
  "personal_fit_or_suitability_included",
  "per_vacancy_application_or_candidacy_fields_included",
];

const AGGREGATE_FIELDS = {
  applications_submitted_today: "submitted_on_report_date",
  confirmations_today: "official_confirmation_on_report_date",
  applications_submitted_last_7_days: "submitted_in_inclusive_7_day_window",
  applications_ready_not_submitted: "ready_not_submitted",
  applications_in_active_preparation: "active_unfinished_preparation",
  applications_requiring_attention: "requires_attention",
  new_employer_responses_today: "selection_response_on_report_date",
  interview_invitations_today: "explicit_interview_invitation_on_report_date",
  all_officially_submitted: "officially_submitted_any_time",
  submitted_by_applicant_bot_with_known_date: "applicant_bot_dated_sends",
  historical_submitted_unknown_exact_date: "historical_portal_confirm_unknown_date",
};

const DEFINITION_KEYS = Object.values(AGGREGATE_FIELDS);

const VACANCY_KEYS = [
  "title_sv",
  "title_explain_fa",
  "employer",
  "location_public",
  "advertised_deadline_date",
  "advertised_deadline_precision",
  "vacancy_date_status",
  "original_ad_url",
  "description_fa",
  "requirements_fa",
  "last_public_ad_check",
  "last_public_ad_check_precision",
  "url_check",
];

const PRIVATE_KEY = /email|e-mail|phone|mobile|personnummer|cover.?letter|\bcv\b|resume|match.?score|application.?status|applicant|candidac|screenshot|password|secret|\btoken\b|\bssn\b|private|filepath|file_path|full_name|first_name|last_name|person_?name/i;

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const SECRET = /(?:ghp_|ghs_|github_pat_|AKIA|BEGIN (?:RSA |OPENSSH )?PRIVATE KEY)/;
const PRIVATE_PATH = /(?:\/home\/|\/Users\/|\\Users\\|SecondBrain|file:\/\/|[A-Za-z]:\\)/;
const PERSONNUMMER = /\b\d{6}[-+]\d{4}\b|\b\d{8}-\d{4}\b/;
const PHONE = /(?:\+\d{7,15}\b|\b(?:tel|sms):)/i;

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function checkKeys(value, allowed, path, errors, optional = new Set()) {
  if (!isObject(value)) {
    errors.push(`${path} must be an object`);
    return false;
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      errors.push(`${path}.${key} is not an allowed public field`);
      if (PRIVATE_KEY.test(key)) errors.push(`${path}.${key} looks like a private field and was refused`);
    }
  }
  for (const key of allowed) {
    if (!optional.has(key) && !(key in value)) errors.push(`${path}.${key} is missing`);
  }
  return true;
}

function checkText(value, path, errors, { min = 1, max = 4000, nullable = false } = {}) {
  if (value === null && nullable) return;
  if (typeof value !== "string") {
    errors.push(`${path} must be a string`);
    return;
  }
  if (value.length < min || value.length > max) errors.push(`${path} has an unexpected length`);
  if (EMAIL.test(value)) errors.push(`${path} contains an email address`);
  if (SECRET.test(value)) errors.push(`${path} contains a secret`);
  if (PRIVATE_PATH.test(value)) errors.push(`${path} contains a private path`);
  if (PERSONNUMMER.test(value)) errors.push(`${path} contains a personal identity number`);
  if (PHONE.test(value)) errors.push(`${path} contains a phone number`);
  if (value.includes(EXAMPLE_MARKER) && path.includes("public_vacancies")) {
    /* Example fixtures are valid schema objects. Publishing them is refused separately. */
  }
}

function checkDate(value, path, errors) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    errors.push(`${path} must be a calendar date`);
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    errors.push(`${path} is not a real calendar date`);
    return false;
  }
  return true;
}

function checkTimestamp(value, path, errors) {
  if (typeof value !== "string" || !splitTimestamp(value) || Number.isNaN(new Date(value).getTime())) {
    errors.push(`${path} must be a full timestamp with seconds and an offset`);
    return false;
  }
  return true;
}

function checkUrl(value, path, errors) {
  if (typeof value !== "string" || value.length > 500) {
    errors.push(`${path} must be a short https URL`);
    return;
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    errors.push(`${path} must be a valid URL`);
    return;
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    errors.push(`${path} must be https without embedded credentials`);
    return;
  }
  if (url.hostname === "localhost" || url.hostname.endsWith(".local") || /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)) {
    errors.push(`${path} must be a public https address`);
  }
}

export function isExampleSummary(summary) {
  return JSON.stringify(summary).includes(EXAMPLE_MARKER);
}

export function validateSummary(summary) {
  const errors = [];
  if (!checkKeys(summary, TOP_LEVEL_KEYS, "$", errors, new Set(["publication"]))) return errors;

  if (summary.schema_version !== "1") errors.push("$.schema_version must be 1");
  if (summary.schema_name !== "public-jobsearch-summary") errors.push("$.schema_name is not the public summary schema");
  if (summary.language !== "fa") errors.push("$.language must be fa");
  if (typeof summary.timezone !== "string" || !/^[A-Za-z]+(?:[_-][A-Za-z]+)*\/[A-Za-z0-9_+-]+$/.test(summary.timezone)) {
    errors.push("$.timezone must be an area/city timezone");
  }
  checkText(summary.tone_note_fa, "$.tone_note_fa", errors, { max: 500 });
  checkText(summary.scope_note_fa, "$.scope_note_fa", errors, { max: 2000 });
  checkText(summary.public_vacancies_note_fa, "$.public_vacancies_note_fa", errors, { max: 4000 });

  const reportDateOk = checkDate(summary.report_date, "$.report_date", errors);
  const generatedOk = checkTimestamp(summary.generated_at, "$.generated_at", errors);
  if (reportDateOk && generatedOk && typeof summary.timezone === "string") {
    try {
      const zoned = dateInTimeZone(summary.generated_at, summary.timezone);
      if (zoned !== summary.report_date) errors.push("$.report_date must be the source timestamp's date in the stated timezone");
    } catch {
      errors.push("$.timezone could not be applied to the source timestamp");
    }
  }

  if (checkKeys(summary.privacy, PRIVACY_KEYS, "$.privacy", errors)) {
    for (const key of PRIVACY_KEYS) {
      if (summary.privacy[key] !== false) errors.push(`$.privacy.${key} must be false`);
    }
  }

  if (checkKeys(summary.aggregates, Object.keys(AGGREGATE_FIELDS), "$.aggregates", errors)) {
    for (const [key, definitionKey] of Object.entries(AGGREGATE_FIELDS)) {
      const aggregate = summary.aggregates[key];
      const aggregatePath = `$.aggregates.${key}`;
      if (!checkKeys(aggregate, ["value", "label_fa", "definition_key", "limitation_fa"], aggregatePath, errors, new Set(["limitation_fa"]))) {
        continue;
      }
      if (!Number.isInteger(aggregate.value) || aggregate.value < 0 || aggregate.value > 100000) {
        errors.push(`${aggregatePath}.value must be a non-negative integer`);
      }
      checkText(aggregate.label_fa, `${aggregatePath}.label_fa`, errors, { max: 300 });
      if (aggregate.definition_key !== definitionKey) errors.push(`${aggregatePath}.definition_key does not match the public metric`);
      if ("limitation_fa" in aggregate) checkText(aggregate.limitation_fa, `${aggregatePath}.limitation_fa`, errors, { max: 2000 });
    }
    const submittedToday = summary.aggregates.applications_submitted_today?.value;
    const submittedWeek = summary.aggregates.applications_submitted_last_7_days?.value;
    const total = summary.aggregates.all_officially_submitted?.value;
    const bot = summary.aggregates.submitted_by_applicant_bot_with_known_date?.value;
    const historical = summary.aggregates.historical_submitted_unknown_exact_date?.value;
    if (Number.isInteger(submittedToday) && Number.isInteger(submittedWeek) && submittedToday > submittedWeek) {
      errors.push("$.aggregates applications submitted today cannot exceed the dated seven-day total");
    }
    if (Number.isInteger(total) && Number.isInteger(bot) && Number.isInteger(historical)) {
      if (bot > total || historical > total || bot + historical > total) {
        errors.push("$.aggregates dated bot filings and unknown-date history cannot exceed total official submissions");
      }
    }
  }

  if (checkKeys(summary.counting_definitions, DEFINITION_KEYS, "$.counting_definitions", errors)) {
    for (const key of DEFINITION_KEYS) {
      const definition = summary.counting_definitions[key];
      const definitionPath = `$.counting_definitions.${key}`;
      if (!checkKeys(definition, ["en", "fa"], definitionPath, errors)) continue;
      checkText(definition.en, `${definitionPath}.en`, errors, { max: 4000 });
      checkText(definition.fa, `${definitionPath}.fa`, errors, { max: 4000 });
    }
  }

  if (!Array.isArray(summary.next_actions) || summary.next_actions.length > 20) {
    errors.push("$.next_actions must be a short list");
  } else {
    summary.next_actions.forEach((action, index) => {
      const actionPath = `$.next_actions[${index}]`;
      if (!checkKeys(action, ["kind", "label_fa", "identifies_employer"], actionPath, errors)) return;
      if (typeof action.kind !== "string" || !/^[a-z0-9_]{3,80}$/.test(action.kind)) errors.push(`${actionPath}.kind is not a public action kind`);
      checkText(action.label_fa, `${actionPath}.label_fa`, errors, { max: 1000 });
      if (action.identifies_employer !== false) errors.push(`${actionPath}.identifies_employer must be false`);
    });
  }

  if (!checkKeys(summary.vacancy_date_status_notes_fa, DATE_STATUSES, "$.vacancy_date_status_notes_fa", errors)) {
    /* exact status vocabulary */
  } else {
    for (const status of DATE_STATUSES) {
      checkText(summary.vacancy_date_status_notes_fa[status], `$.vacancy_date_status_notes_fa.${status}`, errors, { max: 1000 });
    }
  }

  if (!Array.isArray(summary.public_vacancies) || summary.public_vacancies.length > 400) {
    errors.push("$.public_vacancies must be a list of public ads");
  } else {
    summary.public_vacancies.forEach((vacancy, index) => validateVacancy(vacancy, summary.report_date, index, errors));
  }

  if ("publication" in summary) validatePublication(summary, errors);
  return errors;
}

function validateVacancy(vacancy, reportDate, index, errors) {
  const vacancyPath = `$.public_vacancies[${index}]`;
  if (!checkKeys(vacancy, VACANCY_KEYS, vacancyPath, errors)) return;
  checkText(vacancy.title_sv, `${vacancyPath}.title_sv`, errors, { max: 300 });
  checkText(vacancy.title_explain_fa, `${vacancyPath}.title_explain_fa`, errors, { max: 300 });
  checkText(vacancy.employer, `${vacancyPath}.employer`, errors, { max: 300 });
  checkText(vacancy.location_public, `${vacancyPath}.location_public`, errors, { max: 300, nullable: true });
  checkText(vacancy.description_fa, `${vacancyPath}.description_fa`, errors, { max: 4000, nullable: true });
  checkText(vacancy.requirements_fa, `${vacancyPath}.requirements_fa`, errors, { max: 4000, nullable: true });
  checkUrl(vacancy.original_ad_url, `${vacancyPath}.original_ad_url`, errors);

  const datePath = `${vacancyPath}.advertised_deadline_date`;
  if (vacancy.advertised_deadline_date === null) {
    if (vacancy.advertised_deadline_precision !== "unknown" || vacancy.vacancy_date_status !== "نامشخص") {
      errors.push(`${vacancyPath} needs an unknown date category when the deadline date is absent`);
    }
  } else if (checkDate(vacancy.advertised_deadline_date, datePath, errors)) {
    if (vacancy.advertised_deadline_precision !== "date_only") {
      errors.push(`${vacancyPath}.advertised_deadline_precision must be date_only when a calendar date is present`);
    }
    if (reportDate && /^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
      const expected = expectedStatus(vacancy.advertised_deadline_date, reportDate);
      if (vacancy.vacancy_date_status !== expected) {
        errors.push(`${vacancyPath}.vacancy_date_status does not match the deadline date and report date`);
      }
    }
  }
  if (!DATE_STATUSES.includes(vacancy.vacancy_date_status)) errors.push(`${vacancyPath}.vacancy_date_status is not a public date category`);

  if (vacancy.last_public_ad_check_precision === "date_only") checkDate(vacancy.last_public_ad_check, `${vacancyPath}.last_public_ad_check`, errors);
  else if (vacancy.last_public_ad_check_precision === "datetime") checkTimestamp(vacancy.last_public_ad_check, `${vacancyPath}.last_public_ad_check`, errors);
  else errors.push(`${vacancyPath}.last_public_ad_check_precision is not allowed`);

  const checkPath = `${vacancyPath}.url_check`;
  if (!checkKeys(vacancy.url_check, ["http_status", "checked_at", "result"], checkPath, errors)) return;
  if (!Number.isInteger(vacancy.url_check.http_status) || vacancy.url_check.http_status < 100 || vacancy.url_check.http_status > 599) {
    errors.push(`${checkPath}.http_status must be an HTTP status integer`);
  }
  checkTimestamp(vacancy.url_check.checked_at, `${checkPath}.checked_at`, errors);
  if (typeof vacancy.url_check.result !== "string" || !/^[a-z_]{2,32}$/.test(vacancy.url_check.result)) {
    errors.push(`${checkPath}.result is not a short public check result`);
  }
}

function expectedStatus(deadline, reportDate) {
  if (deadline < reportDate) return "مهلت گذشته";
  if (deadline === reportDate) return "مهلت امروز";
  return "مهلت آینده";
}

function validatePublication(summary, errors) {
  const publication = summary.publication;
  if (!checkKeys(publication, ["kind", "label_fa", "updated_at", "source_generated_at", "note_fa"], "$.publication", errors)) return;
  if (publication.kind !== "revision_check") errors.push("$.publication.kind must be revision_check");
  checkText(publication.label_fa, "$.publication.label_fa", errors, { max: 200 });
  checkText(publication.note_fa, "$.publication.note_fa", errors, { max: 1000 });
  const updatedOk = checkTimestamp(publication.updated_at, "$.publication.updated_at", errors);
  const sourceOk = checkTimestamp(publication.source_generated_at, "$.publication.source_generated_at", errors);
  if (sourceOk && publication.source_generated_at !== summary.generated_at) {
    errors.push("$.publication.source_generated_at must stay equal to generated_at");
  }
  if (updatedOk && publication.updated_at === summary.generated_at) {
    errors.push("$.publication.updated_at must be the later check time, not a copy of the source time");
  }
}

export function assertValidSummary(summary) {
  const errors = validateSummary(summary);
  if (errors.length === 0) return;
  const error = new Error(errors.join("\n"));
  error.code = "INVALID_SUMMARY";
  error.errors = errors;
  throw error;
}
