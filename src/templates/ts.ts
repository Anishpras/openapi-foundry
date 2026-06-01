/**
 * Config-driven TypeScript templates: the SDK + MCP entry points, package.json,
 * and tsconfig. The auth section of the config is woven into `configure()` (SDK)
 * and the env→setConfig glue (MCP) so both authenticate identically. The static
 * pieces (client.ts, tsdown configs, fix-dts) come from ./static.
 */

import type { ResolvedConfig } from "../config.js";

/** A PascalCase identifier derived from the product display name. */
function clientTypeName(cfg: ResolvedConfig): string {
	const base = cfg.displayName.replace(/[^a-zA-Z0-9]/g, "") || "Api";
	return /^[0-9]/.test(base) ? `Api${base}` : base;
}

/** Self-contained tsconfig for a generated TS package (no workspace base). */
export function tsconfigJson(): string {
	return `${JSON.stringify(
		{
			compilerOptions: {
				target: "ES2022",
				module: "ESNext",
				moduleResolution: "Bundler",
				lib: ["ES2022", "DOM"],
				strict: true,
				declaration: true,
				esModuleInterop: true,
				skipLibCheck: true,
				forceConsistentCasingInFileNames: true,
				verbatimModuleSyntax: true,
				outDir: "dist",
				rootDir: "src",
				noEmit: true,
				allowImportingTsExtensions: true,
			},
			include: ["src"],
		},
		null,
		2,
	)}\n`;
}

export function sdkIndexTs(cfg: ResolvedConfig): string {
	const opts = `${clientTypeName(cfg)}Options`;
	const L: string[] = [];
	L.push("/**");
	L.push(` * ${cfg.packages.sdk} — official TypeScript SDK for the ${cfg.displayName} API.`);
	L.push(" *");
	L.push(" * The typed surface under ./gen is generated from the OpenAPI spec and must");
	L.push(" * not be hand-edited. This entry adds auth configuration on top.");
	L.push(" */");
	L.push('import { setConfig } from "./client.ts";');
	L.push("");
	L.push(`const DEFAULT_BASE_URL = ${JSON.stringify(cfg.baseUrl)};`);
	L.push("");
	L.push(`export interface ${opts} {`);
	// Single-quoted line: backticks must stay literal in the output.
	L.push('\t/** Your API key. Sent as `Authorization: Bearer`. */');
	L.push("\tapiKey: string;");
	L.push(`\t/** Override the API base URL (default ${cfg.baseUrl}). */`);
	L.push("\tbaseUrl?: string;");
	for (const h of cfg.auth.extraHeaders) {
		L.push(`\t/** ${h.description} Sent as the ${h.header} header. */`);
		L.push(`\t${h.option}?: string;`);
	}
	L.push("}");
	L.push("");
	L.push("/** Configure global request defaults (base URL + auth headers). */");
	L.push(`export function configure(options: ${opts}): void {`);
	L.push("\tsetConfig({");
	L.push("\t\tbaseURL: options.baseUrl ?? DEFAULT_BASE_URL,");
	L.push("\t\theaders: {");
	L.push("\t\t\tAuthorization: `Bearer ${options.apiKey}`,"); // single-quoted: literal ${} + backticks
	for (const h of cfg.auth.extraHeaders) {
		L.push(
			`\t\t\t...(options.${h.option} ? { ${JSON.stringify(h.header)}: options.${h.option} } : {}),`,
		);
	}
	L.push("\t\t},");
	L.push("\t});");
	L.push("}");
	L.push("");
	L.push("// Generated operation functions + models.");
	L.push('export * from "./gen/client/index.ts";');
	L.push('export * from "./gen/types/index.ts";');
	return `${L.join("\n")}\n`;
}

export function mcpIndexTs(cfg: ResolvedConfig): string {
	const { apiKeyEnv, baseUrlEnv, extraHeaders } = cfg.auth;
	const L: string[] = [];
	L.push("#!/usr/bin/env node");
	L.push("/**");
	L.push(` * ${cfg.packages.mcp} — MCP server for the ${cfg.displayName} API.`);
	L.push(" *");
	L.push(" * Exposes every operation as an MCP tool. Launched by an MCP client over");
	L.push(" * stdio with auth in env.");
	L.push(" */");
	L.push('import { setConfig } from "./client.ts";');
	L.push("");
	L.push(`const apiKey = process.env.${apiKeyEnv};`);
	L.push("if (!apiKey) {");
	L.push(`\tprocess.stderr.write(${JSON.stringify(`${apiKeyEnv} environment variable is required\n`)});`);
	L.push("\tprocess.exit(1);");
	L.push("}");
	L.push("");
	L.push("setConfig({");
	if (baseUrlEnv) {
		L.push(`\tbaseURL: process.env.${baseUrlEnv} ?? ${JSON.stringify(cfg.baseUrl)},`);
	} else {
		L.push(`\tbaseURL: ${JSON.stringify(cfg.baseUrl)},`);
	}
	L.push("\theaders: {");
	L.push("\t\tAuthorization: `Bearer ${apiKey}`,"); // single-quoted: literal
	for (const h of extraHeaders) {
		L.push(
			`\t\t...(process.env.${h.env} ? { ${JSON.stringify(h.header)}: process.env.${h.env} } : {}),`,
		);
	}
	L.push("\t},");
	L.push("});");
	L.push("");
	L.push("// The generated server registers every tool and connects stdio on import.");
	L.push('await import("./gen/mcp/server.ts");');
	return `${L.join("\n")}\n`;
}

const TSDOWN_DEV = { tsdown: "^0.12.0", typescript: "^5.9.0" } as const;

export function sdkPackageJson(cfg: ResolvedConfig): string {
	return `${JSON.stringify(
		{
			name: cfg.packages.sdk,
			version: "0.1.0",
			description: `Official TypeScript SDK for the ${cfg.displayName} API (generated from OpenAPI).`,
			type: "module",
			main: "./dist/index.js",
			module: "./dist/index.js",
			types: "./dist/index.d.ts",
			exports: { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } },
			files: ["dist"],
			scripts: { build: "tsdown && node scripts/fix-dts.mjs", typecheck: "tsc --noEmit" },
			license: "MIT",
			publishConfig: { access: "public" },
			dependencies: { zod: "^4.0.0" },
			devDependencies: { ...TSDOWN_DEV },
		},
		null,
		2,
	)}\n`;
}

export function mcpPackageJson(cfg: ResolvedConfig): string {
	return `${JSON.stringify(
		{
			name: cfg.packages.mcp,
			version: "0.1.0",
			description: `Model Context Protocol (MCP) server for the ${cfg.displayName} API (generated from OpenAPI).`,
			type: "module",
			bin: { [`${cfg.cliBin}-mcp`]: "./dist/index.js" },
			files: ["dist"],
			scripts: { build: "tsdown", typecheck: "tsc --noEmit" },
			license: "MIT",
			publishConfig: { access: "public" },
			dependencies: { "@modelcontextprotocol/sdk": "^1.29.0", zod: "^4.0.0" },
			devDependencies: { ...TSDOWN_DEV, "@types/node": "^22.0.0" },
		},
		null,
		2,
	)}\n`;
}
