import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { repoRoot } from "../scripts/lib/paths.mjs";
import path from "node:path";

function channel(hex, index) {
  const value = parseInt(hex.slice(index, index + 2), 16) / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function contrast(foreground, background) {
  const lum = (hex) => 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
  const lighter = Math.max(lum(foreground), lum(background));
  const darker = Math.min(lum(foreground), lum(background));
  return (lighter + 0.05) / (darker + 0.05);
}

test("main text and status pairs meet WCAG AA contrast", () => {
  const css = readFileSync(path.join(repoRoot, "scripts", "client", "style.css"), "utf8");
  const value = (name) => {
    const match = css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
    assert.ok(match, name);
    return match[1];
  };
  const pairs = [
    ["--ink", "--bg"],
    ["--ink", "--paper"],
    ["--muted", "--paper"],
    ["--link", "--paper"],
    ["--sage", "--paper"],
    ["--on-sage", "--sage"],
    ["--on-sage", "--sage-deep"],
    ["--sage", "--sage-soft"],
    ["--today-ink", "--today-bg"],
    ["--future-ink", "--future-bg"],
    ["--past-ink", "--past-bg"],
    ["--unknown-ink", "--unknown-bg"],
    ["--clay", "--paper"],
    ["--clay", "--clay-soft"],
  ];
  for (const [foreground, background] of pairs) {
    const ratio = contrast(value(foreground), value(background));
    assert.ok(ratio >= 4.5, `${foreground} on ${background} is ${ratio.toFixed(2)}`);
  }
});
