#!/usr/bin/env bun
import { readFileSync, writeFileSync } from "fs";
const sql = readFileSync("src/schema.sql", "utf-8");
const escaped = sql.replace(/\\/g, "\\\\").replace(/\${/g, "\\${").replace(/`/g, "\\`");
const out = `// AUTO-GENERATED — do not edit. Run: bun run build:schema\n// Source: src/schema.sql\n\nexport const SCHEMA_SQL = \`\n${escaped}\n\`;\n`;
writeFileSync("src/core/schema-embedded.ts", out);
console.log("schema-embedded.ts regenerated");
