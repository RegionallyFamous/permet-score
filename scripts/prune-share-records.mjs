import { pruneSharedDeckRecords } from "../app/share-store.ts";

const args = new Set(process.argv.slice(2));
const daysArg = process.argv.find((arg) => arg.startsWith("--days="));

const result = await pruneSharedDeckRecords({
  dryRun: args.has("--dry-run"),
  includeBlob: !args.has("--local-only"),
  maxAgeDays: Math.max(1, Number(daysArg?.split("=")[1] ?? 7)),
  qaOnly: args.has("--qa-only"),
});

console.log(JSON.stringify(result, null, 2));
