import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { ARCHIVE_SCHEMA } from "./paths.mjs";
import { sha256 } from "./format.mjs";

export function manifestPath(dataDir) {
  return path.join(dataDir, "manifest.json");
}

export function emptyManifest() {
  return {
    archive_schema: ARCHIVE_SCHEMA,
    latest_snapshot_id: null,
    snapshots: [],
  };
}

export function readManifest(dataDir) {
  const file = manifestPath(dataDir);
  if (!existsSync(file)) return emptyManifest();
  const manifest = JSON.parse(readFileSync(file, "utf8"));
  if (manifest.archive_schema !== ARCHIVE_SCHEMA || !Array.isArray(manifest.snapshots)) {
    throw new Error("Archive manifest is not the public archive schema.");
  }
  return manifest;
}

export function writeManifest(dataDir, manifest) {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(manifestPath(dataDir), `${JSON.stringify(manifest, null, 2)}\n`);
}

export function snapshotDir(dataDir, id) {
  if (!/^\d{4}-\d{2}-\d{2}-(?:check-)?\d{6}$/.test(id)) throw new Error("Snapshot id is not safe.");
  return path.join(dataDir, "snapshots", id);
}

export function readSnapshot(dataDir, id) {
  const dir = snapshotDir(dataDir, id);
  const bytes = readFileSync(path.join(dir, "summary.json"));
  const listed = readFileSync(path.join(dir, "summary.sha256"), "utf8").trim();
  const actual = sha256(bytes);
  if (listed !== actual) throw new Error(`Snapshot ${id} does not match its stored fingerprint.`);
  return { bytes, summary: JSON.parse(bytes.toString("utf8")), sha256: actual };
}

export function assertSnapshotAbsent(dataDir, id) {
  if (existsSync(snapshotDir(dataDir, id))) {
    throw new Error(`Refusing to overwrite snapshot ${id}.`);
  }
}
