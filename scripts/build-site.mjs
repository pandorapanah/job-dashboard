import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readManifest, readSnapshot, snapshotDir } from "./lib/archive.mjs";
import { defaultDataDir, defaultSiteDir } from "./lib/paths.mjs";
import { publicManifest, readClientAsset, renderArchive, renderLibrary, renderNotFound, renderReport } from "./lib/render.mjs";
import { validateSummary } from "./lib/schema.mjs";

function hrefsFor(summaryId, place) {
  if (place === "latest-report") {
    return {
      library: "library/index.html",
      immutable: `reports/${summaryId}/index.html`,
      summary: `reports/${summaryId}/summary.json`,
    };
  }
  if (place === "latest-library") {
    return {
      library: "index.html",
      report: "../index.html",
      immutable: `../reports/${summaryId}/library.html`,
      summary: `../reports/${summaryId}/summary.json`,
    };
  }
  if (place === "snapshot-report") {
    return {
      library: "library.html",
      snapshotReport: "index.html",
      summary: "summary.json",
    };
  }
  return {
    library: "library.html",
    report: "index.html",
    snapshotReport: "index.html",
    summary: "summary.json",
  };
}

export function buildSite({ dataDir = defaultDataDir, siteDir = defaultSiteDir } = {}) {
  const manifest = readManifest(dataDir);
  if (!manifest.latest_snapshot_id || manifest.snapshots.length === 0) {
    throw new Error("There is no public snapshot to build.");
  }
  const loaded = manifest.snapshots.map((entry) => {
    const snapshot = readSnapshot(dataDir, entry.id);
    const errors = validateSummary(snapshot.summary);
    if (errors.length) throw new Error(`Snapshot ${entry.id} failed validation.\n${errors.join("\n")}`);
    if (snapshot.sha256 !== entry.sha256) throw new Error(`Manifest fingerprint does not match snapshot ${entry.id}.`);
    return { entry, ...snapshot };
  });
  const latest = loaded.find((item) => item.entry.id === manifest.latest_snapshot_id);
  if (!latest) throw new Error("Latest snapshot is missing from the archive.");

  rmSync(siteDir, { recursive: true, force: true });
  mkdirSync(path.join(siteDir, "assets"), { recursive: true });
  for (const name of ["style.css", "vacancies.js", "view.js", "favicon.svg"]) {
    writeFileSync(path.join(siteDir, "assets", name), readClientAsset(name));
  }
  writeFileSync(path.join(siteDir, ".nojekyll"), "");
  writeFileSync(path.join(siteDir, "404.html"), renderNotFound());
  mkdirSync(path.join(siteDir, "archive"), { recursive: true });
  mkdirSync(path.join(siteDir, "library"), { recursive: true });

  writeFileSync(
    path.join(siteDir, "index.html"),
    renderReport(latest.summary, {
      variant: "latest",
      depth: 0,
      hrefs: hrefsFor(latest.entry.id, "latest-report"),
      sha256: latest.sha256,
      snapshotId: latest.entry.id,
    }),
  );
  writeFileSync(
    path.join(siteDir, "library", "index.html"),
    renderLibrary(latest.summary, {
      variant: "latest",
      depth: 1,
      hrefs: hrefsFor(latest.entry.id, "latest-library"),
      snapshotId: latest.entry.id,
    }),
  );
  writeFileSync(path.join(siteDir, "archive", "index.html"), renderArchive(manifest));
  writeFileSync(path.join(siteDir, "archive", "manifest.json"), `${JSON.stringify(publicManifest(manifest), null, 2)}\n`);

  for (const item of loaded) {
    const dir = path.join(siteDir, "reports", item.entry.id);
    mkdirSync(dir, { recursive: true });
    cpSync(path.join(snapshotDir(dataDir, item.entry.id), "summary.json"), path.join(dir, "summary.json"));
    writeFileSync(
      path.join(dir, "index.html"),
      renderReport(item.summary, {
        variant: "snapshot",
        depth: 2,
        hrefs: hrefsFor(item.entry.id, "snapshot-report"),
        sha256: item.sha256,
        snapshotId: item.entry.id,
      }),
    );
    writeFileSync(
      path.join(dir, "library.html"),
      renderLibrary(item.summary, {
        variant: "snapshot",
        depth: 2,
        hrefs: hrefsFor(item.entry.id, "snapshot-library"),
        snapshotId: item.entry.id,
      }),
    );
  }
  return { siteDir, latestId: latest.entry.id };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  buildSite();
}
