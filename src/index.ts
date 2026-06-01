/**
 * openapi-foundry — generate a TS SDK, MCP server, CLI, and Python SDK/MCP from
 * one OpenAPI spec and one config, with the custom fetch client + response
 * envelope handling templated consistently across artifacts.
 */

import { mkdirSync } from "node:fs";
import { generateCli } from "./generators/cli.js";
import { generatePython } from "./generators/python.js";
import { generateTsMcp, generateTsSdk } from "./generators/ts.js";
import { log, step, writeUnder } from "./util.js";
import type { ResolvedConfig } from "./config.js";

export {
	defineConfig,
	resolveConfig,
	loadConfig,
	ALL_ARTIFACTS,
} from "./config.js";
export type {
	FoundryConfig,
	ResolvedConfig,
	AuthConfig,
	ExtraHeader,
	Artifact,
} from "./config.js";

/** Emit the workspace root so the generated TS packages link to each other. */
function emitWorkspaceRoot(cfg: ResolvedConfig): void {
	writeUnder(
		cfg.outRoot,
		"package.json",
		`${JSON.stringify(
			{
				name: `${cfg.name}-artifacts`,
				version: "0.0.0",
				private: true,
				description: `Generated SDK/MCP/CLI for the ${cfg.displayName} API (openapi-foundry).`,
				packageManager: "pnpm@9.15.0",
				scripts: {
					build: "pnpm -r build",
					typecheck: "pnpm -r typecheck",
				},
			},
			null,
			2,
		)}\n`,
	);
	writeUnder(cfg.outRoot, "pnpm-workspace.yaml", 'packages:\n  - "packages/*"\n');
}

/** Run the configured generators against the resolved config. */
export async function runFoundry(cfg: ResolvedConfig): Promise<void> {
	mkdirSync(cfg.outRoot, { recursive: true });
	log(`openapi-foundry → ${cfg.displayName}`);
	log(`  spec:   ${cfg.specPath}`);
	log(`  out:    ${cfg.outRoot}`);
	log(`  build:  ${cfg.artifacts.join(", ")}`);

	const wantsTs = cfg.artifacts.some((a) => a === "ts-sdk" || a === "ts-mcp" || a === "cli");
	if (wantsTs) {
		step("Workspace root");
		emitWorkspaceRoot(cfg);
	}

	// Order matters: the CLI depends on the SDK package.
	if (cfg.artifacts.includes("ts-sdk")) await generateTsSdk(cfg);
	if (cfg.artifacts.includes("ts-mcp")) await generateTsMcp(cfg);
	if (cfg.artifacts.includes("cli")) await generateCli(cfg);
	if (cfg.artifacts.includes("python")) await generatePython(cfg);
}
