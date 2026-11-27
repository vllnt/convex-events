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

// Everything that may ship. Anything else (AGENTS.md, roadmaps, scripts/, example/, other
// docs/ files) fails, so a widened "files" entry cannot leak repository-only content.
const ALLOWED =
  /^(package\.json|README\.md|LICENSE|CHANGELOG\.md|llms\.txt|docs\/API\.md|dist\/.+\.(js|d\.ts)(\.map)?|src\/.+\.tsx?)$/;
const TEST_FILE = /(^|\/)__tests__\/|\.(test|spec|test-d|bench)\.[cm]?[jt]sx?$/;

// A link to this repository on GitHub, any branch or tag: captures the file path.
const GITHUB_FILE =
  /^https:\/\/github\.com\/vllnt\/convex-events\/(?:blob|tree)\/[^/]+\/([^#?]+)/;

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
  if (TEST_FILE.test(path)) problems.push(`must not ship: ${path} (test file)`);
  else if (!ALLOWED.test(path)) {
    problems.push(`must not ship: ${path} (not a published file)`);
  }
}

const llms = readFileSync("llms.txt", "utf8");
// Inline links `[text](target)`, reference links `[id]: target` and autolinks `<target>`.
const targets = [
  ...llms.matchAll(/\]\(\s*<?([^)\s>]+)>?[^)]*\)/g),
  ...llms.matchAll(/^\s*\[[^\]]+\]:\s*<?(\S+?)>?(?:\s|$)/gm),
  ...llms.matchAll(/<((?:\.{0,2}\/|https?:)[^>\s]+)>/g),
].map((match) => match[1]);
for (const target of targets) {
  const github = GITHUB_FILE.exec(target);
  if (github) {
    if (packed.has(github[1])) {
      problems.push(
        `llms.txt links shipped file ${github[1]} by GitHub URL; use ./${github[1]}`,
      );
    }
  } else if (!/^[a-z][a-z0-9+.-]*:/i.test(target)) {
    const path = target.split(/[#?]/)[0].replace(/^\.\//, "");
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
