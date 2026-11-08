import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { assertSnapshotAbsent, readManifest, readSnapshot, snapshotDir, writeManifest } from "./lib/archive.mjs";
import { buildSite } from "./build-site.mjs";
import { factsEqual, formatNowInZone, sha256, snapshotIdFromTimestamp } from "./lib/format.mjs";
import { defaultDataDir, defaultSiteDir, REVISION_LABEL_FA, REVISION_NOTE_FA } from "./lib/paths.mjs";
import { assertValidSummary, isExampleSummary } from "./lib/schema.mjs";

function refuse(message, code = "INVALID_SUMMARY") {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function guardExample(summary, dataDir, allowExample) {
  if (!isExampleSummary(summary)) return;
  if (!allowExample || path.resolve(dataDir) === path.resolve(defaultDataDir)) {
    refuse("Example data is refused before any archive write.", "EXAMPLE");
  }
}

function guardClock(now, dataDir) {
  if (now && path.resolve(dataDir) === path.resolve(defaultDataDir)) {
    refuse("A manual clock is refused for the real archive. The check time comes from the current clock.", "CLOCK");
  }
}

function remember(dataDir, entry) {
  const manifest = readManifest(dataDir);
  if (manifest.snapshots.some((snapshot) => snapshot.id === entry.id)) {
    refuse(`Refusing to overwrite snapshot ${entry.id}.`, "IMMUTABLE");
  }
  manifest.snapshots.push(entry);
  manifest.latest_snapshot_id = entry.id;
  writeManifest(dataDir, manifest);
}

function writeBytes(dataDir, id, bytes) {
  assertSnapshotAbsent(dataDir, id);
  const dir = snapshotDir(dataDir, id);
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "summary.json");
  writeFileSync(file, bytes);
  const digest = sha256(bytes);
  writeFileSync(path.join(dir, "summary.sha256"), `${digest}\n`);
  return digest;
}

export function publishInput({ inputPath, dataDir = defaultDataDir, siteDir = defaultSiteDir, allowExample = false, now = null, build = true }) {
  guardClock(now, dataDir);
  const raw = readFileSync(inputPath);
  let summary;
  try {
    summary = JSON.parse(raw.toString("utf8"));
  } catch {
    refuse("The input is not JSON. Nothing was written.");
  }
  try {
    assertValidSummary(summary);
  } catch (error) {
    refuse(`${error.message}\nNothing was written.`);
  }
  guardExample(summary, dataDir, allowExample);
  if (summary.publication?.kind === "revision_check") {
    return publishMatchingRevision({ summary, dataDir, siteDir, build });
  }
  if (summary.publication) refuse("Only a revision_check publication block can be added. Nothing was written.");

  const id = snapshotIdFromTimestamp(summary.generated_at, "source");
  const digest = writeBytes(dataDir, id, raw);
  remember(dataDir, {
    id,
    role: "source",
    label_fa: "خلاصهٔ اصلی",
    report_date: summary.report_date,
    generated_at: summary.generated_at,
    updated_at: null,
    source_snapshot_id: null,
    sha256: digest,
  });
  if (build) buildSite({ dataDir, siteDir });
  return { id, role: "source", sha256: digest };
}

function publishMatchingRevision({ summary, dataDir, siteDir, build }) {
  const manifest = readManifest(dataDir);
  const matches = manifest.snapshots.filter((snapshot) => snapshot.role === "source" && snapshot.generated_at === summary.generated_at);
  if (matches.length !== 1) refuse("A revision check must match exactly one archived source snapshot. Nothing was written.");
  const source = readSnapshot(dataDir, matches[0].id);
  if (!factsEqual(source.summary, summary)) {
    refuse("Revision check changed the public facts. Nothing new was written and the source snapshot was left untouched.");
  }
  const id = snapshotIdFromTimestamp(summary.publication.updated_at, "check");
  const bytes = Buffer.from(`${JSON.stringify(summary, null, 2)}\n`);
  const digest = writeBytes(dataDir, id, bytes);
  const sourceAfter = readSnapshot(dataDir, matches[0].id);
  if (sourceAfter.sha256 !== source.sha256 || !factsEqual(sourceAfter.summary, source.summary)) {
    refuse("Original snapshot changed during revision publish.", "IMMUTABLE");
  }
  remember(dataDir, {
    id,
    role: "revision_check",
    label_fa: summary.publication.label_fa,
    report_date: summary.report_date,
    generated_at: summary.generated_at,
    updated_at: summary.publication.updated_at,
    source_snapshot_id: matches[0].id,
    sha256: digest,
  });
  if (build) buildSite({ dataDir, siteDir });
  return { id, role: "revision_check", sha256: digest, sourceId: matches[0].id };
}

export function publishRevisionCheck({ snapshotId, dataDir = defaultDataDir, siteDir = defaultSiteDir, allowExample = false, now = null, build = true }) {
  guardClock(now, dataDir);
  const source = readSnapshot(dataDir, snapshotId);
  if (source.summary.publication) refuse("Revision checks start from a source snapshot. Nothing was written.");
  guardExample(source.summary, dataDir, allowExample);
  const updatedAt = now || formatNowInZone(new Date(), source.summary.timezone);
  const revision = JSON.parse(JSON.stringify(source.summary));
  revision.publication = {
    kind: "revision_check",
    label_fa: REVISION_LABEL_FA,
    updated_at: updatedAt,
    source_generated_at: source.summary.generated_at,
    note_fa: REVISION_NOTE_FA,
  };
  try {
    assertValidSummary(revision);
  } catch (error) {
    refuse(`${error.message}\nNothing was written.`);
  }
  if (!factsEqual(revision, source.summary)) refuse("Revision check changed the public facts. Nothing was written.");
  const before = source.sha256;
  const id = snapshotIdFromTimestamp(updatedAt, "check");
  const bytes = Buffer.from(`${JSON.stringify(revision, null, 2)}\n`);
  const digest = writeBytes(dataDir, id, bytes);
  const reread = readSnapshot(dataDir, snapshotId);
  if (reread.sha256 !== before) refuse("Original snapshot bytes changed. This should not happen.", "IMMUTABLE");
  remember(dataDir, {
    id,
    role: "revision_check",
    label_fa: REVISION_LABEL_FA,
    report_date: revision.report_date,
    generated_at: revision.generated_at,
    updated_at: updatedAt,
    source_snapshot_id: snapshotId,
    sha256: digest,
  });
  if (build) buildSite({ dataDir, siteDir });
  return { id, role: "revision_check", sha256: digest, sourceId: snapshotId, updatedAt };
}

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else {
      out[key] = next;
      index += 1;
    }
  }
  return out;
}

function main(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log("node scripts/publish-report.mjs --input summary.json");
    console.log("node scripts/publish-report.mjs --revision-check --snapshot SNAPSHOT_ID");
    return;
  }
  const options = {
    dataDir: args["data-dir"] || defaultDataDir,
    siteDir: args["site-dir"] || defaultSiteDir,
    allowExample: Boolean(args["allow-example"]),
    now: args.now || null,
    build: !args["skip-build"],
  };
  const result = args["revision-check"]
    ? publishRevisionCheck({ ...options, snapshotId: args.snapshot })
    : publishInput({ ...options, inputPath: args.input });
  console.log(`Published ${result.role} ${result.id}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
