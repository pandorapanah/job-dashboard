import assert from "node:assert/strict";
import test from "node:test";
import { scanText, scanTree } from "../scripts/privacy-gate.mjs";

test("scanner names private content without echoing the secret", () => {
  const errors = scanText("docs/leak.html", "contact person@example.com and /home/private/cv");
  assert.match(errors.join("\n"), /email address/);
  assert.match(errors.join("\n"), /private path/);
  assert.equal(errors.some((error) => error.includes("person@example.com")), false);
});

test("the published tree passes the privacy gate", () => {
  const errors = scanTree();
  assert.deepEqual(errors, []);
});
