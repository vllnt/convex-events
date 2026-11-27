// Fails when the published tarball is missing a required file, contains a file that must
// not ship, or when llms.txt links to something the tarball does not contain.
// Run after `pnpm build` (dist/ is part of the tarball): `pnpm test:package`.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";

const REQUIRED = [
  "package.json",
  "README.md",
  "LICENSE",
  "CHANGELOG.md",
  "llms.txt",
  "docs/API.md",
  "dist/client/index.js",
  "dist/client/index.d.ts",
  "dist/react/index.js",
  "dist/component/convex.config.js",
  "src/test.ts",
];

/** [pattern, why it must not ship] */
const FORBIDDEN = [
  [/(^|\/)(AGENTS|CLAUDE)\.md$/, "contributor agent instructions"],
  [/\.(test|spec)\.[cm]?[jt]sx?$/, "test or spec file"],
  [/^(example|scripts|tests?|\.github)\//, "repository-only directory"],
  [/^docs\/(?!API\.md$)/, "internal doc (only docs/API.md ships)"],
];

const GITHUB_MAIN = "https://github.com/vllnt/convex-events/blob/main/";

const output = execFileSync(
  "npm",
  ["pack", "--dry-run", "--json", "--ignore-scripts"],
  { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
);
const packed = new Set(JSON.parse(output)[0].files.map((file) => file.path));
const problems = [];

for (const path of REQUIRED) {
  if (!packed.has(path)) {
    problems.push(
      `missing from tarball: ${path} (add it to package.json "files", or run pnpm build)`,
    );
  }
}

for (const path of packed) {
  for (const [pattern, why] of FORBIDDEN) {
    if (pattern.test(path)) problems.push(`must not ship: ${path} (${why})`);
  }
}

const llms = readFileSync("llms.txt", "utf8");
for (const [, target] of llms.matchAll(/\]\(([^)\s]+)\)/g)) {
  if (target.startsWith(GITHUB_MAIN)) {
    const path = target.slice(GITHUB_MAIN.length);
    if (packed.has(path)) {
      problems.push(
        `llms.txt links shipped file ${path} by GitHub URL; use ./${path}`,
      );
    }
  } else if (!/^[a-z][a-z0-9+.-]*:/i.test(target)) {
    const path = target.split("#")[0].replace(/^\.\//, "");
    if (!target.startsWith("./") || !packed.has(path)) {
      problems.push(
        `llms.txt links ${target}, which must be ./<path> to a file in the tarball`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error(`FAIL package contents (${problems.length}):`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log(
  `OK    package contents: ${packed.size} files, ${REQUIRED.length} required present`,
);
