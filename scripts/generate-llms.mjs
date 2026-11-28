import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Kept for existing automation; llms.txt is curated, not generated from source.
// Shipped files are linked relatively so the links match the installed version.
// scripts/check-documentation.mjs (run by `pnpm test:package`) checks the rest.
const index = readFileSync("llms.txt", "utf8");
assert.ok(index.startsWith("# @vllnt/convex-events\n"));
assert.deepEqual(
  [
    "[README](./README.md)",
    "[API Reference](./docs/API.md)",
    "[Errors and fixes](./README.md#errors-and-fixes)",
    "[Changelog](./CHANGELOG.md)",
    "[License](./LICENSE)",
    "](https://oss.vllnt.com/llms.txt)",
  ].filter((link) => !index.includes(link)),
  [],
  "llms.txt is missing required links",
);
assert.ok(index.includes("## For coding agents\n"));
assert.ok(index.includes("`node_modules/@vllnt/convex-events/docs/`"));
assert.doesNotMatch(
  index,
  /blob\/main\/(?:README\.md|docs\/|CHANGELOG\.md|LICENSE)/u,
  "link shipped files with ./ paths, not GitHub main",
);
