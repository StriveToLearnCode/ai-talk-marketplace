#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");
const MANIFESTS = [
  "plugins/ai-talk/.codex-plugin/plugin.json",
  "ai-talk-public-marketplace/plugins/ai-talk/.codex-plugin/plugin.json",
];

export function releaseVersion(currentVersion, sourceSha) {
  const baseVersion = currentVersion.split("+", 1)[0];
  const normalizedSha = sourceSha.trim().toLowerCase();
  if (!baseVersion || !/^[0-9a-f]{7,64}$/.test(normalizedSha)) {
    throw new Error("--source-sha must be a 7-64 character hexadecimal Git commit.");
  }
  return `${baseVersion}+codex.${normalizedSha.slice(0, 12)}`;
}

export async function prepareMarketplaceRelease({ root = ROOT, sourceSha, dryRun = false }) {
  const parsed = await Promise.all(MANIFESTS.map(async (relativePath) => {
    const absolutePath = path.join(root, relativePath);
    return {
      relativePath,
      absolutePath,
      manifest: JSON.parse(await readFile(absolutePath, "utf8")),
    };
  }));
  const pluginNames = new Set(parsed.map(({ manifest }) => manifest.name));
  const baseVersions = new Set(parsed.map(({ manifest }) => manifest.version.split("+", 1)[0]));
  if (pluginNames.size !== 1 || !pluginNames.has("ai-talk")) {
    throw new Error("Release manifests must both describe the ai-talk plugin.");
  }
  if (baseVersions.size !== 1) {
    throw new Error("Release manifests must use the same base version.");
  }

  const version = releaseVersion(parsed[0].manifest.version, sourceSha);
  const changed = [];
  for (const item of parsed) {
    if (item.manifest.version === version) continue;
    changed.push(item.relativePath);
    if (!dryRun) {
      item.manifest.version = version;
      await writeFile(item.absolutePath, `${JSON.stringify(item.manifest, null, 2)}\n`);
    }
  }
  return { version, changed, dry_run: dryRun };
}

function parseArgs(args) {
  const options = { sourceSha: process.env.GITHUB_SHA ?? "", dryRun: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--source-sha") options.sourceSha = args[++index] ?? "";
    else if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--help") options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write("Usage: node scripts/prepare-marketplace-release.mjs --source-sha <git-sha> [--dry-run]\n");
    return;
  }
  const result = await prepareMarketplaceRelease(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
