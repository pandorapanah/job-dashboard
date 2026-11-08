import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const repoRoot = path.resolve(here, "../..");
export const defaultDataDir = path.join(repoRoot, "data");
export const defaultSiteDir = path.join(repoRoot, "docs");
export const clientDir = path.join(repoRoot, "scripts", "client");

export const EXAMPLE_MARKER = "EXAMPLE-ONLY-NOT-A-REAL-VACANCY";

export const ARCHIVE_SCHEMA = "job-dashboard-public-archive-v1";

export const REVISION_LABEL_FA = "بازبینی و کنترل";

export const REVISION_NOTE_FA =
  "این یک بازبینی و کنترل همان گزارش است، نه گزارش روز بعد و نه ارسال تازه. عددها و آگهی‌ها عین خلاصهٔ اصلی مانده‌اند.";
