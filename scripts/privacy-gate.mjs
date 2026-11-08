import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { EXAMPLE_MARKER, repoRoot } from "./lib/paths.mjs";

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const SECRET = /(?:ghp_|ghs_|github_pat_|AKIA)[A-Za-z0-9_]{20,}|BEGIN (?:RSA |OPENSSH )?PRIVATE KEY/;
const PRIVATE_PATH = /(?:\/home\/|\/Users\/|\\Users\\|SecondBrain|file:\/\/)/;
const PHONE = /(?:\+\d{7,15}\b|\b(?:tel|sms):)/i;
const TRACKING = /googletagmanager|google-analytics|plausible\.io|umami|facebook\.net|hotjar|segment\.com|sentry\.io/i;

function isPublished(relative) {
  return relative === "README.md" || relative.startsWith("docs/") || relative.startsWith("data/");
}

const ALLOWED_AUTHOR = /^(?:cursoragent@cursor\.com|[^@\s]+@users\.noreply\.github\.com)$/i;

function walk(dir, files = []) {
  if (!statSafe(dir)) return files;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

function statSafe(file) {
  try {
    return statSync(file);
  } catch {
    return null;
  }
}

export function scanText(file, text) {
  const errors = [];
  const relative = file.startsWith(repoRoot) ? path.relative(repoRoot, file) : file;
  if (file.endsWith(".map")) errors.push(`${relative}: source map`);
  if (SECRET.test(text)) errors.push(`${relative}: secret`);
  if (!isPublished(relative)) return errors;
  if (EMAIL.test(text)) errors.push(`${relative}: email address`);
  if (PRIVATE_PATH.test(text)) errors.push(`${relative}: private path`);
  if (PHONE.test(text)) errors.push(`${relative}: phone number`);
  if (TRACKING.test(text)) errors.push(`${relative}: tracker`);
  if ((relative.startsWith("docs/") || relative.startsWith("data/")) && text.includes(EXAMPLE_MARKER)) {
    errors.push(`${relative}: example fixture rendered as site data`);
  }
  if ((relative.startsWith("docs/") || relative.startsWith("data/")) && text.includes("pandorapanah")) {
    errors.push(`${relative}: repository owner name in site data`);
  }
  if ((relative.startsWith("docs/") || relative.startsWith("data/")) && /current-summary|job-dashborad|CURSOR_CONVERSATION/.test(text)) {
    errors.push(`${relative}: transport metadata or old repository slug`);
  }
  return errors;
}

export function scanTree(root = repoRoot) {
  const errors = [];
  for (const file of walk(root)) {
    if (file.includes(`${path.sep}.git${path.sep}`)) continue;
    const text = readFileSync(file, "utf8");
    errors.push(...scanText(file, text));
  }
  const authors = execFileSync("git", ["log", "--format=%an%n%ae%n%cn%n%ce"], { cwd: root, encoding: "utf8" });
  for (const line of authors.split(/\n/)) {
    if (!line.includes("@")) continue;
    if (!ALLOWED_AUTHOR.test(line.trim())) errors.push("git history: unexpected author email");
  }
  if (!statSafe(path.join(root, "docs", "index.html"))) errors.push("docs/index.html missing");
  const fixtures = walk(path.join(root, "test", "fixtures"));
  if (fixtures.length === 0) errors.push("test/fixtures: missing unmistakable example fixture");
  for (const fixture of fixtures) {
    const text = readFileSync(fixture, "utf8");
    if (!text.includes(EXAMPLE_MARKER)) errors.push(`${path.relative(root, fixture)}: fixture is not marked as an example`);
  }
  const readme = readFileSync(path.join(root, "README.md"), "utf8");
  if (!readme.includes("https://pandorapanah.github.io/job-dashboard/")) errors.push("README: missing the Pages URL");
  if (!readme.includes("job-dashboard")) errors.push("README: missing corrected repository slug");
  if (readme.includes("job-dashborad")) errors.push("README: old repository slug");
  return errors;
}

function main() {
  const errors = scanTree(repoRoot);
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
    return;
  }
  console.log("Privacy gate passed.");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
