import process from "node:process";

export function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    query: null,
    sourceRoots: [],
    excludeRoots: [],
    evidenceTypes: [],
    evidenceEntries: [],
    previousContractPath: null,
    limit: 3,
    debugJson: false,
    format: "text",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--help") {
      args.help = true;
      continue;
    }
    if (flag === "--debug-json") {
      args.debugJson = true;
      continue;
    }
    if (!["--root", "--query", "--source-root", "--exclude-root", "--evidence-type", "--evidence-json", "--previous-contract", "--limit", "--top-k", "--format"].includes(flag)) {
      throw new Error(`Unknown argument: ${flag}`);
    }
    const value = argv[++index];
    if (value === undefined) throw new Error(`${flag} requires a value.`);
    if (flag === "--root") args.root = value;
    if (flag === "--query") args.query = value;
    if (flag === "--source-root") args.sourceRoots.push(value);
    if (flag === "--exclude-root") args.excludeRoots.push(value);
    if (flag === "--evidence-type") args.evidenceTypes.push(value);
    if (flag === "--evidence-json") {
      let entry;
      try {
        entry = JSON.parse(value);
      } catch {
        throw new Error("--evidence-json must be a valid JSON object.");
      }
      if (!entry || Array.isArray(entry) || typeof entry !== "object") {
        throw new Error("--evidence-json must contain a JSON object.");
      }
      args.evidenceEntries.push(entry);
    }
    if (flag === "--previous-contract") args.previousContractPath = value;
    if (flag === "--format") {
      if (!["text", "json"].includes(value)) throw new Error("--format must be text or json.");
      args.format = value;
    }
    if (flag === "--limit" || flag === "--top-k") {
      args.limit = Number.parseInt(value, 10);
      if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 20) {
        throw new Error("--limit must be an integer between 1 and 20.");
      }
    }
  }

  if (args.debugJson) args.format = "json";
  if (!args.help && !args.query) throw new Error("--query is required.");
  return args;
}

export const HELP = "Usage: route-company-skills.mjs --root <project> --query '<user input>' [--source-root <label=path>] [--evidence-type <type>] [--evidence-json <json-object>] [--previous-contract <json-file>] [--format text|json] [--debug-json]";
