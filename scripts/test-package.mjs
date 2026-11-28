// Fails when the published tarball is missing a required file, contains a file that must
// not ship, or when llms.txt links to something the tarball does not contain. Then installs
// the packed tarball in a temporary consumer, checks the docs contract
// (scripts/check-documentation.mjs) and type-checks and runs the README examples.
// Run after `pnpm build` (dist/ is part of the tarball): `pnpm test:package`.
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

import {
  checkDocumentation,
  convexHost,
  writeHost,
} from "./check-documentation.mjs";

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

function checkContents() {
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
    if (TEST_FILE.test(path))
      problems.push(`must not ship: ${path} (test file)`);
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
}

/** Lowest supported versions: the convex peer floor and React 18. */
const CONSUMER_DEPENDENCIES = [
  "convex@1.45.0",
  "react@18.3.1",
  "@types/react@18.3.31",
  "typescript@5.9.3",
  "convex-test@0.0.56",
  "vite@8.2.2",
  "@types/node@22.20.2",
  "vitest@5.1.1",
  "@edge-runtime/vm@5.0.0",
];

/** @param {string[]} files @param {string[]} [extra] */
const tscArguments = (files, extra = []) => [
  "exec",
  "tsc",
  "--noEmit",
  "--strict",
  "--target",
  "ES2022",
  ...extra,
  ...files,
];
const BUNDLER = ["--module", "ESNext", "--moduleResolution", "Bundler"];
const NODENEXT = ["--module", "NodeNext", "--moduleResolution", "NodeNext"];

function checkConsumer() {
  const root = process.cwd();
  /** @type {{ name: string, version: string }} */
  const metadata = JSON.parse(readFileSync("package.json", "utf8"));
  const tarball = `${metadata.name.replace("@", "").replace("/", "-")}-${metadata.version}.tgz`;
  const temporary = mkdtempSync(join(tmpdir(), "events-consumer-"));
  /** @param {string} command @param {string[]} arguments_ @param {string} [cwd] */
  const run = (command, arguments_, cwd = temporary) =>
    execFileSync(command, arguments_, { cwd, stdio: "inherit" });
  try {
    run("pnpm", ["pack", "--pack-destination", temporary], root);
    writeFileSync(
      join(temporary, "package.json"),
      JSON.stringify({
        pnpm: { ignoredBuiltDependencies: ["esbuild"] },
        private: true,
        type: "module",
      }),
    );
    // pnpm 11 reads the build-script policy from the workspace file, pnpm 10 from package.json.
    // No lockfile here, so pnpm picks transitive versions: copy the repo's workspace file so
    // its release-age gate (minimumReleaseAge, minimumReleaseAgeExclude) applies and cannot drift.
    const workspace = readFileSync(join(root, "pnpm-workspace.yaml"), "utf8");
    writeFileSync(
      join(temporary, "pnpm-workspace.yaml"),
      `${workspace.trimEnd()}\nallowBuilds:\n  esbuild: false\n`,
    );
    run("pnpm", ["add", join(temporary, tarball), ...CONSUMER_DEPENDENCIES]);
    // Agents read the bundled docs from node_modules, so they must ship and resolve.
    const installed = join(temporary, "node_modules", metadata.name);
    const missing = [
      "README.md",
      "CHANGELOG.md",
      "LICENSE",
      "llms.txt",
      ...readdirSync(join(root, "docs")).map((file) => `docs/${file}`),
    ].filter((file) => !existsSync(join(installed, file)));
    if (missing.length > 0)
      throw new Error(`tarball is missing ${missing.join(", ")}`);
    // Docs contract, then README examples compile and run against the packed package.
    const examples = checkDocumentation(installed, temporary);
    console.log("OK    documentation contract");
    const hostFiles = writeHost(
      temporary,
      convexHost(installed, examples),
      examples,
    );
    run(
      "pnpm",
      tscArguments(hostFiles, [
        ...BUNDLER,
        "--jsx",
        "react-jsx",
        "--types",
        "vite/client,node",
      ]),
    );
    // The README's own vitest.config.mts runs its test example.
    run("pnpm", ["exec", "vitest", "run"]);
    writeFileSync(
      join(temporary, "consumer.ts"),
      `
import { Events } from "@vllnt/convex-events";
import type { ComponentApi } from "@vllnt/convex-events/_generated/component.js";
import type { ComponentApi as BareComponentApi } from "@vllnt/convex-events/_generated/component";
import config from "@vllnt/convex-events/convex.config.js";
import { useEventCount } from "@vllnt/convex-events/react";
import { defineApp } from "convex/server";
declare const component: ComponentApi;
const bare: BareComponentApi = component; void bare;
const client = new Events(component);
const app = defineApp(); app.use(config);
void client; void app; void useEventCount;
`,
    );
    run("pnpm", tscArguments(["consumer.ts"], NODENEXT));
    writeFileSync(
      join(temporary, "registration.ts"),
      `
import { register } from "@vllnt/convex-events/test";
import { convexTest } from "convex-test";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
const host = defineSchema({ unrelated: defineTable({ label: v.string() }) });
register(convexTest(host, {}), "custom");
`,
    );
    run(
      "pnpm",
      tscArguments(
        ["registration.ts"],
        [...BUNDLER, "--types", "vite/client,node"],
      ),
    );
    // The shipped test helper is TypeScript source: it must also compile for NodeNext consumers.
    run(
      "pnpm",
      tscArguments(["registration.ts"], [...NODENEXT, "--types", "node"]),
    );
    run("node", [
      "--input-type=module",
      "-e",
      'import { Events } from "@vllnt/convex-events"; import config from "@vllnt/convex-events/convex.config.js"; import { useActivityFeed } from "@vllnt/convex-events/react"; if (!Events || !config || !useActivityFeed) throw Error("missing export");',
    ]);
    console.log("OK    packed package consumer checks");
  } finally {
    rmSync(temporary, { force: true, recursive: true });
  }
}

checkContents();
checkConsumer();
