import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { publishInput, publishRevisionCheck } from "../scripts/publish-report.mjs";
import { defaultDataDir, repoRoot } from "../scripts/lib/paths.mjs";

const fixture = path.join(repoRoot, "test", "fixtures", "example-only-summary.json");

function hashFile(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

test("invalid and private input is refused before any snapshot directory is created", () => {
  const root = mkdtempSync(path.join(tmpdir(), "job-dashboard-refuse-"));
  const dataDir = path.join(root, "data");
  const siteDir = path.join(root, "site");
  const bad = path.join(root, "bad.json");
  const summary = JSON.parse(readFileSync(fixture, "utf8"));
  summary.applicant_email = "person@example.com";
  writeFileSync(bad, JSON.stringify(summary));
  assert.throws(() => publishInput({ inputPath: bad, dataDir, siteDir, allowExample: true }), /private field/);
  assert.equal(existsSync(path.join(dataDir, "snapshots")), false);
  assert.equal(existsSync(siteDir), false);
});

test("example data cannot enter the real archive", () => {
  const siteDir = mkdtempSync(path.join(tmpdir(), "job-dashboard-site-"));
  assert.throws(() => publishInput({ inputPath: fixture, dataDir: defaultDataDir, siteDir, allowExample: true }), /Example data/);
  assert.equal(existsSync(path.join(defaultDataDir, "snapshots", "1999-01-01-100000")), false);
});

test("a revision check keeps the original snapshot bytes and becomes latest", () => {
  const root = mkdtempSync(path.join(tmpdir(), "job-dashboard-rev-"));
  const dataDir = path.join(root, "data");
  const siteDir = path.join(root, "site");
  const first = publishInput({ inputPath: fixture, dataDir, siteDir, allowExample: true });
  assert.equal(first.id, "1999-01-01-100000");
  const originalFile = path.join(dataDir, "snapshots", first.id, "summary.json");
  const originalHash = hashFile(originalFile);
  const originalPage = hashFile(path.join(siteDir, "reports", first.id, "index.html"));
  const second = publishRevisionCheck({
    snapshotId: first.id,
    dataDir,
    siteDir,
    allowExample: true,
    now: "1999-01-01T15:30:00+01:00",
  });
  assert.equal(second.id, "1999-01-01-check-153000");
  assert.equal(hashFile(originalFile), originalHash);
  assert.equal(hashFile(path.join(siteDir, "reports", first.id, "index.html")), originalPage);
  const manifest = JSON.parse(readFileSync(path.join(dataDir, "manifest.json"), "utf8"));
  assert.equal(manifest.latest_snapshot_id, second.id);
  const latest = readFileSync(path.join(siteDir, "index.html"), "utf8");
  const archived = readFileSync(path.join(siteDir, "reports", first.id, "index.html"), "utf8");
  assert.match(latest, /بازبینی و کنترل/);
  assert.match(latest, /1999-01-01T15:30:00\+01:00/);
  assert.doesNotMatch(archived, /1999-01-01T15:30:00\+01:00/);
  assert.match(archived, /data-snapshot-role="source"/);
  assert.match(latest, /data-report-date="1999-01-01"/);
  assert.match(readFileSync(path.join(siteDir, "archive", "index.html"), "utf8"), /1999-01-01-100000/);
  const library = readFileSync(path.join(siteDir, "library", "index.html"), "utf8");
  assert.match(library, /EXAMPLE-ONLY-NOT-A-REAL-VACANCY/);
  assert.doesNotMatch(latest, /EXAMPLE-ONLY-NOT-A-REAL-EMPLOYER/);
  assert.doesNotMatch(library, /نمونهٔ آزمایشی: ارسال امروز/);
  assert.equal(existsSync(path.join(siteDir, "assets", "view.js")), true);
  assert.doesNotMatch(library, /<form/);
});
