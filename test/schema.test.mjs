import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateSummary } from "../scripts/lib/schema.mjs";

const fixturePath = new URL("./fixtures/example-only-summary.json", import.meta.url);

function example() {
  return JSON.parse(readFileSync(fixturePath, "utf8"));
}

test("example fixture is valid and unmistakably fake", () => {
  const summary = example();
  assert.deepEqual(validateSummary(summary), []);
  assert.equal(summary.public_vacancies[0].title_sv, "EXAMPLE-ONLY-NOT-A-REAL-VACANCY");
  assert.notEqual(summary.report_date, "2026-11-08");
  assert.notEqual(summary.aggregates.applications_submitted_today.value, 2);
});

test("private and unknown fields are refused", () => {
  const cases = [];
  const withEmail = example();
  withEmail.applicant_email = "person@example.com";
  cases.push(withEmail);
  const withStatus = example();
  withStatus.public_vacancies[0].application_status = "applied";
  cases.push(withStatus);
  const withScore = example();
  withScore.public_vacancies[0].match_score = 99;
  cases.push(withScore);
  const withPath = example();
  withPath.public_vacancies[0].description_fa = "see /home/private/tracker";
  cases.push(withPath);
  const identified = example();
  identified.next_actions[0].identifies_employer = true;
  cases.push(identified);
  const identity = example();
  identity.privacy.person_identity_included = true;
  cases.push(identity);
  for (const summary of cases) {
    const errors = validateSummary(summary);
    assert.ok(errors.length > 0, JSON.stringify(summary).slice(0, 120));
  }
  const privateErrors = validateSummary(withEmail).join("\n");
  assert.match(privateErrors, /private field/);
  assert.match(validateSummary(withStatus).join("\n"), /application_status/);
  assert.match(validateSummary(withScore).join("\n"), /match_score/);
});

test("deadline category must follow the report date", () => {
  const summary = example();
  summary.public_vacancies[0].vacancy_date_status = "مهلت امروز";
  const errors = validateSummary(summary);
  assert.match(errors.join("\n"), /vacancy_date_status/);
});

test("missing text stays null instead of being invented", () => {
  const summary = example();
  summary.public_vacancies[0].location_public = null;
  summary.public_vacancies[0].description_fa = null;
  summary.public_vacancies[0].requirements_fa = null;
  assert.deepEqual(validateSummary(summary), []);
});

test("today cannot exceed the dated week, and history cannot exceed the lifetime total", () => {
  const summary = example();
  summary.aggregates.applications_submitted_today.value = 9;
  summary.aggregates.applications_submitted_last_7_days.value = 1;
  assert.match(validateSummary(summary).join("\n"), /seven-day/);
  const history = example();
  history.aggregates.submitted_by_applicant_bot_with_known_date.value = 19;
  history.aggregates.historical_submitted_unknown_exact_date.value = 19;
  assert.match(validateSummary(history).join("\n"), /unknown-date history/);
});

test("a revision check may add only the publication block", () => {
  const summary = example();
  summary.publication = {
    kind: "new_day",
    label_fa: "نمونه",
    updated_at: "1999-01-02T10:00:00+01:00",
    source_generated_at: summary.generated_at,
    note_fa: "نمونهٔ آزمایشی",
  };
  assert.match(validateSummary(summary).join("\n"), /revision_check/);
  summary.publication.kind = "revision_check";
  assert.deepEqual(validateSummary(summary), []);
});
