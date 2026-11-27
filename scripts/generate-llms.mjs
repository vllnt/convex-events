import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Kept for existing automation; llms.txt is curated, not generated from source.
const index = readFileSync("llms.txt", "utf8");
assert.ok(index.startsWith("# @vllnt/convex-events\n"));
// Shipped files are linked relatively so the links match the installed version.
assert.ok(index.includes("[README](./README.md)"));
assert.ok(index.includes("[API Reference](./docs/API.md)"));
assert.ok(index.includes("[Changelog](./CHANGELOG.md)"));
assert.ok(index.includes("node_modules/@vllnt/convex-events/docs/"));
assert.equal(index.match(/^.*https:\/\/oss\.vllnt\.com\/llms\.txt.*$/gm)?.length, 1);
