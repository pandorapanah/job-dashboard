import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { buildSite } from "../scripts/build-site.mjs";
import { sortVacancies } from "../scripts/client/vacancies.js";
import { repoRoot } from "../scripts/lib/paths.mjs";

const ORIGINAL_ID = "2026-11-08-205637";
const ORIGINAL_HASH = "0c927b489b647438a671bc2bc2f74ccd3c7f2776108d494ceb1d814b68938986";
const dataDir = path.join(repoRoot, "data");
const docs = path.join(repoRoot, "docs");

function read(file) {
  return readFileSync(file, "utf8");
}

function sha(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

test("the real archive keeps the original public snapshot and a same-day revision", () => {
  const manifest = JSON.parse(read(path.join(dataDir, "manifest.json")));
  const original = JSON.parse(read(path.join(dataDir, "snapshots", ORIGINAL_ID, "summary.json")));
  assert.equal(sha(path.join(dataDir, "snapshots", ORIGINAL_ID, "summary.json")), ORIGINAL_HASH);
  assert.equal(sha(path.join(docs, "reports", ORIGINAL_ID, "summary.json")), ORIGINAL_HASH);
  assert.equal(original.publication, undefined);
  assert.equal(original.report_date, "2026-11-08");
  assert.equal(original.generated_at, "2026-11-08T20:56:37+01:00");
  assert.equal(original.aggregates.applications_submitted_today.value, 2);
  assert.equal(original.aggregates.confirmations_today.value, 2);
  assert.equal(original.aggregates.applications_submitted_last_7_days.value, 2);
  assert.equal(original.aggregates.applications_ready_not_submitted.value, 0);
  assert.equal(original.aggregates.applications_in_active_preparation.value, 1);
  assert.equal(original.aggregates.applications_requiring_attention.value, 1);
  assert.equal(original.aggregates.new_employer_responses_today.value, 0);
  assert.equal(original.aggregates.interview_invitations_today.value, 0);
  assert.equal(original.aggregates.all_officially_submitted.value, 7);
  assert.equal(original.aggregates.submitted_by_applicant_bot_with_known_date.value, 2);
  assert.equal(original.aggregates.historical_submitted_unknown_exact_date.value, 5);
  assert.equal(original.public_vacancies.length, 31);

  const latestEntry = manifest.snapshots.find((snapshot) => snapshot.id === manifest.latest_snapshot_id);
  assert.equal(latestEntry.role, "revision_check");
  assert.equal(latestEntry.report_date, "2026-11-08");
  assert.equal(latestEntry.generated_at, original.generated_at);
  assert.equal(latestEntry.source_snapshot_id, ORIGINAL_ID);
  assert.notEqual(latestEntry.updated_at, original.generated_at);
  const revision = JSON.parse(read(path.join(dataDir, "snapshots", latestEntry.id, "summary.json")));
  assert.equal(revision.publication.kind, "revision_check");
  assert.equal(revision.publication.label_fa, "بازبینی و کنترل");
  const { publication: ignoredPublication, ...revisionFacts } = revision;
  assert.equal(ignoredPublication.kind, "revision_check");
  assert.deepEqual(revisionFacts, original);
  const statuses = Object.groupBy(original.public_vacancies, (vacancy) => vacancy.vacancy_date_status);
  assert.equal(statuses["مهلت امروز"].length, 2);
  assert.equal(statuses["مهلت آینده"].length, 29);
});

test("latest resolves to the revision while the original page stays a pure snapshot", () => {
  const manifest = JSON.parse(read(path.join(dataDir, "manifest.json")));
  const latestEntry = manifest.snapshots.find((snapshot) => snapshot.id === manifest.latest_snapshot_id);
  const root = mkdtempSync(path.join(tmpdir(), "job-dashboard-pure-"));
  const pureData = path.join(root, "data");
  const pureSite = path.join(root, "site");
  mkdirSync(path.join(pureData, "snapshots", ORIGINAL_ID), { recursive: true });
  cpSync(path.join(dataDir, "snapshots", ORIGINAL_ID), path.join(pureData, "snapshots", ORIGINAL_ID), { recursive: true });
  const onlyOriginal = {
    ...manifest,
    latest_snapshot_id: ORIGINAL_ID,
    snapshots: manifest.snapshots.filter((snapshot) => snapshot.id === ORIGINAL_ID),
  };
  writeFileSync(path.join(pureData, "manifest.json"), `${JSON.stringify(onlyOriginal, null, 2)}\n`);
  buildSite({ dataDir: pureData, siteDir: pureSite });
  assert.equal(
    read(path.join(pureSite, "reports", ORIGINAL_ID, "index.html")),
    read(path.join(docs, "reports", ORIGINAL_ID, "index.html")),
  );
  assert.equal(
    read(path.join(pureSite, "reports", ORIGINAL_ID, "library.html")),
    read(path.join(docs, "reports", ORIGINAL_ID, "library.html")),
  );

  const latest = read(path.join(docs, "index.html"));
  const originalPage = read(path.join(docs, "reports", ORIGINAL_ID, "index.html"));
  const library = read(path.join(docs, "library", "index.html"));
  assert.match(latest, /data-snapshot-role="revision_check"/);
  assert.match(latest, new RegExp(latestEntry.updated_at.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(latest, /بازبینی و کنترل/);
  assert.match(latest, /نه یک گزارش روز بعد/);
  assert.match(originalPage, /data-snapshot-role="source"/);
  assert.doesNotMatch(originalPage, new RegExp(latestEntry.updated_at.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(latest, /data-metric="applications_ready_not_submitted" data-value="0"/);
  assert.match(latest, /data-metric="applications_in_active_preparation" data-value="1"/);
  assert.match(latest, /صفر یعنی هیچ درخواستی الان آمادهٔ ارسال بدون مانع نیست/);
  assert.match(latest, /نه از یک مرور کامل همهٔ صندوق‌های ایمیل/);
  assert.match(latest, /تاریخ روزانه ساخته نشده/);
  assert.match(latest, /نه فقط به‌خاطر اینکه تاریخشون نوشته شده/);
  for (const vacancy of JSON.parse(read(path.join(dataDir, "snapshots", ORIGINAL_ID, "summary.json"))).public_vacancies) {
    assert.equal(latest.includes(vacancy.employer), false, vacancy.employer);
    assert.equal(latest.includes(vacancy.title_sv), false, vacancy.title_sv);
    assert.equal(latest.includes(vacancy.original_ad_url), false);
    assert.equal(library.includes(vacancy.employer), true, vacancy.employer);
    assert.equal(library.includes(vacancy.title_sv), true, vacancy.title_sv);
  }
  assert.doesNotMatch(library, /درخواست‌هایی که امروز فرستاده شدن/);
  assert.match(library, /lang="sv" dir="ltr"/);
  assert.match(latest, /<html lang="fa" dir="rtl">/);
  assert.doesNotMatch(library, /<form/);
  assert.doesNotMatch(`${latest}\n${library}`, /EXAMPLE-ONLY-NOT-A-REAL-VACANCY|job-dashborad|pandorapanah/);
  const deadlines = [...library.matchAll(/data-deadline="([^"]*)"/g)].map((match) => match[1]);
  const sorted = sortVacancies(
    deadlines.map((deadline, index) => ({ deadline, title: String(index), employer: "", url: String(index) })),
    "deadline-asc",
  ).map((item) => item.deadline);
  assert.deepEqual(deadlines, sorted);
  assert.equal(deadlines.filter((deadline) => deadline === "2026-11-08").length, 2);
});
