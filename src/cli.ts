#!/usr/bin/env node
/**
 * openapi-foundry CLI.
 *
 *   openapi-foundry generate [--config <path>] [--quiet]
 *   openapi-foundry init [--out <path>]
 *
 * With no --config, looks for openapi-foundry.config.{ts,mjs,js,json} in the cwd.
 */

import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { loadConfig } from "./config.js";
import { runFoundry } from "./index.js";
import { log, setQuiet } from "./util.js";

const CONFIG_CANDIDATES = [
	"openapi-foundry.config.ts",
	"openapi-foundry.config.mjs",
	"openapi-foundry.config.js",
	"openapi-foundry.config.json",
];

const EXAMPLE_CONFIG = `import { defineConfig } from "openapi-foundry";

export default defineConfig({
	spec: "./openapi.json",
	outDir: "./generated",
	displayName: "My API",
	name: "myapi",
	npmScope: "@myapi",
	baseUrl: "https://api.example.com",
	auth: {
		apiKeyEnv: "MYAPI_API_KEY",
		baseUrlEnv: "MYAPI_BASE_URL",
		extraHeaders: [
			// Example tenant header — delete if your API doesn't need one:
			// { header: "X-Tenant-Id", env: "MYAPI_TENANT_ID", option: "tenantId", flag: "tenant", flagChar: "t" },
		],
	},
	artifacts: ["ts-sdk", "ts-mcp", "cli", "python"],
});
`;

function printHelp(): void {
	process.stdout.write(
		[
			"openapi-foundry — generate SDK/MCP/CLI/Python from one OpenAPI spec",
			"",
			"Usage:",
			"  openapi-foundry generate [--config <path>] [--quiet]",
			"  openapi-foundry init [--out <path>]",
			"",
			"Options:",
			"  -c, --config <path>  Path to the foundry config (default: openapi-foundry.config.* in cwd)",
			"      --quiet          Suppress underlying tool output",
			"  -h, --help           Show this help",
			"",
		].join("\n"),
	);
}

function findConfig(): string {
	for (const name of CONFIG_CANDIDATES) {
		const p = resolve(process.cwd(), name);
		if (existsSync(p)) return p;
	}
	throw new Error(
		`No config found. Looked for ${CONFIG_CANDIDATES.join(", ")} in ${process.cwd()}. Run \`openapi-foundry init\` or pass --config.`,
	);
}

async function main(): Promise<void> {
	const { values, positionals } = parseArgs({
		allowPositionals: true,
		options: {
			config: { type: "string", short: "c" },
			out: { type: "string" },
			quiet: { type: "boolean" },
			help: { type: "boolean", short: "h" },
		},
	});

	if (values.help) {
		printHelp();
		return;
	}

	const cmd = positionals[0] ?? "generate";

	if (cmd === "init") {
		const target = resolve(process.cwd(), values.out ?? "openapi-foundry.config.ts");
		if (existsSync(target)) throw new Error(`${target} already exists.`);
		writeFileSync(target, EXAMPLE_CONFIG);
		log(`Wrote ${target}`);
		return;
	}

	if (cmd === "generate") {
		if (values.quiet) setQuiet(true);
		const cfgPath = values.config ? resolve(process.cwd(), values.config) : findConfig();
		const cfg = await loadConfig(cfgPath);
		await runFoundry(cfg);
		log("✓ Done.");
		return;
	}

	printHelp();
	throw new Error(`Unknown command: ${cmd}`);
}

main().catch((err) => {
	process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
	process.exit(1);
});
