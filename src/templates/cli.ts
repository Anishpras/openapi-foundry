/**
 * Config-driven CLI (oclif) templates. The auth config becomes the global
 * flags, the credential store, and the resolution precedence — so the CLI
 * authenticates exactly like the SDK and MCP. The heavy, generic files
 * (invoke/render/types/bin) come from ./static; here we emit the pieces that
 * depend on naming + auth.
 */

import type { ResolvedConfig } from "../config.js";

export function cliPackageJson(cfg: ResolvedConfig): string {
	return `${JSON.stringify(
		{
			name: cfg.packages.cli,
			version: "0.1.0",
			description: `Official command-line interface for the ${cfg.displayName} API (commands generated from OpenAPI).`,
			type: "module",
			bin: { [cfg.cliBin]: "./bin/run.js" },
			files: ["bin", "dist", "oclif.manifest.json"],
			scripts: { build: "tsc", typecheck: "tsc --noEmit" },
			oclif: {
				bin: cfg.cliBin,
				dirname: cfg.cliBin,
				commands: "./dist/commands",
				topicSeparator: " ",
			},
			license: "MIT",
			publishConfig: { access: "public" },
			engines: { node: ">=20" },
			dependencies: { [cfg.packages.sdk]: "workspace:*", "@oclif/core": "^4.0.0" },
			devDependencies: { "@types/node": "^22.0.0", oclif: "^4.0.0", typescript: "^5.9.0" },
		},
		null,
		2,
	)}\n`;
}

export function cliTsconfig(): string {
	return `${JSON.stringify(
		{
			compilerOptions: {
				target: "ES2022",
				module: "NodeNext",
				moduleResolution: "NodeNext",
				lib: ["ES2022"],
				types: ["node"],
				strict: true,
				esModuleInterop: true,
				skipLibCheck: true,
				forceConsistentCasingInFileNames: true,
				verbatimModuleSyntax: true,
				resolveJsonModule: true,
				declaration: false,
				sourceMap: true,
				outDir: "dist",
				rootDir: "src",
			},
			include: ["src/**/*"],
			exclude: ["dist", "node_modules"],
		},
		null,
		2,
	)}\n`;
}

/** Tiny generated re-export so the static invoke.ts stays config-independent. */
export function sdkReexport(cfg: ResolvedConfig): string {
	return `// Generated: re-export the SDK so lib/invoke.ts can stay generic.\nexport * as sdk from ${JSON.stringify(cfg.packages.sdk)};\n`;
}

export function baseTs(cfg: ResolvedConfig): string {
	const L: string[] = [];
	L.push("/**");
	L.push(` * Base class for every ${cfg.cliBin} command — defines the global flags.`);
	L.push(" */");
	L.push('import { Command, Flags } from "@oclif/core";');
	L.push("");
	L.push("export abstract class BaseCommand extends Command {");
	L.push("\tstatic baseFlags = {");
	L.push("\t\tjson: Flags.boolean({");
	L.push(`\t\t\tdescription: ${JSON.stringify("Output the raw JSON response instead of a table.")},`);
	L.push('\t\t\thelpGroup: "GLOBAL",');
	L.push("\t\t}),");
	for (const h of cfg.auth.extraHeaders) {
		L.push(`\t\t${JSON.stringify(h.flag)}: Flags.string({`);
		if (h.flagChar) L.push(`\t\t\tchar: ${JSON.stringify(h.flagChar)},`);
		L.push(`\t\t\tdescription: ${JSON.stringify(`${h.description} (sent as ${h.header}).`)},`);
		L.push('\t\t\thelpGroup: "GLOBAL",');
		L.push("\t\t}),");
	}
	L.push('\t\t"base-url": Flags.string({');
	L.push(`\t\t\tdescription: ${JSON.stringify("Override the API base URL.")},`);
	L.push('\t\t\thelpGroup: "GLOBAL",');
	L.push("\t\t}),");
	L.push('\t\t"api-key": Flags.string({');
	L.push(`\t\t\tdescription: ${JSON.stringify("API key to use for this call (overrides login/env).")},`);
	L.push('\t\t\thelpGroup: "GLOBAL",');
	L.push("\t\t}),");
	L.push("\t\tdata: Flags.string({");
	L.push('\t\t\tchar: "d",');
	L.push(`\t\t\tdescription: ${JSON.stringify("JSON request body for write operations.")},`);
	L.push('\t\t\thelpGroup: "GLOBAL",');
	L.push("\t\t}),");
	L.push('\t\t"data-file": Flags.string({');
	L.push(`\t\t\tdescription: ${JSON.stringify("Read the JSON request body from a file ('-' for stdin).")},`);
	L.push('\t\t\thelpGroup: "GLOBAL",');
	L.push("\t\t}),");
	L.push("\t};");
	L.push("}");
	return `${L.join("\n")}\n`;
}

export function configTs(cfg: ResolvedConfig): string {
	const { apiKeyEnv, baseUrlEnv, extraHeaders } = cfg.auth;
	const configDirName = `.${cfg.cliBin}`;
	const L: string[] = [];
	L.push("/**");
	L.push(" * Persistent CLI credentials + the precedence rules for resolving them.");
	L.push(` * Stored at ~/${configDirName}/config.json (mode 0600).`);
	L.push(" */");
	L.push('import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";');
	L.push('import { homedir } from "node:os";');
	L.push('import { dirname, join } from "node:path";');
	L.push("");
	L.push(`export const DEFAULT_BASE_URL = ${JSON.stringify(cfg.baseUrl)};`);
	L.push("");
	L.push("export interface StoredConfig {");
	L.push("\tapiKey?: string;");
	L.push("\tbaseUrl?: string;");
	for (const h of extraHeaders) L.push(`\t${h.option}?: string;`);
	L.push("}");
	L.push("");
	L.push("export interface ResolvedAuth {");
	L.push("\tapiKey: string;");
	L.push("\tbaseUrl: string;");
	for (const h of extraHeaders) L.push(`\t${h.option}?: string;`);
	L.push("}");
	L.push("");
	L.push("export interface AuthFlags {");
	L.push('\t"api-key"?: string;');
	L.push('\t"base-url"?: string;');
	for (const h of extraHeaders) L.push(`\t${JSON.stringify(h.flag)}?: string;`);
	L.push("}");
	L.push("");
	L.push("export interface CommandFlags extends AuthFlags {");
	L.push("\tjson?: boolean;");
	L.push("\tdata?: string;");
	L.push('\t"data-file"?: string;');
	L.push("\t[flag: string]: unknown;");
	L.push("}");
	L.push("");
	L.push("export function configDir(): string {");
	L.push(`\treturn join(homedir(), ${JSON.stringify(configDirName)});`);
	L.push("}");
	L.push("export function configPath(): string {");
	L.push('\treturn join(configDir(), "config.json");');
	L.push("}");
	L.push("");
	L.push("export function loadConfigFile(): StoredConfig {");
	L.push("\ttry {");
	L.push('\t\treturn JSON.parse(readFileSync(configPath(), "utf8")) as StoredConfig;');
	L.push("\t} catch {");
	L.push("\t\treturn {};");
	L.push("\t}");
	L.push("}");
	L.push("");
	L.push("export function saveConfigFile(config: StoredConfig): void {");
	L.push("\tconst path = configPath();");
	L.push("\tmkdirSync(dirname(path), { recursive: true, mode: 0o700 });");
	L.push('\twriteFileSync(path, `${JSON.stringify(config, null, 2)}\\n`, { mode: 0o600 });');
	L.push("\tchmodSync(path, 0o600);");
	L.push("}");
	L.push("");
	L.push("export function deleteConfigFile(): boolean {");
	L.push("\ttry {");
	L.push("\t\trmSync(configPath());");
	L.push("\t\treturn true;");
	L.push("\t} catch {");
	L.push("\t\treturn false;");
	L.push("\t}");
	L.push("}");
	L.push("");
	const apiKeyMsg = `No API key found. Run \`${cfg.cliBin} login\`, set ${apiKeyEnv}, or pass --api-key.`;
	L.push("export function resolveAuth(flags: AuthFlags): ResolvedAuth {");
	L.push("\tconst file = loadConfigFile();");
	L.push(`\tconst apiKey = flags["api-key"] ?? process.env.${apiKeyEnv} ?? file.apiKey;`);
	L.push("\tif (!apiKey) {");
	L.push(`\t\tthrow new Error(${JSON.stringify(apiKeyMsg)});`);
	L.push("\t}");
	const baseUrlExpr = baseUrlEnv
		? `flags["base-url"] ?? process.env.${baseUrlEnv} ?? file.baseUrl ?? DEFAULT_BASE_URL`
		: 'flags["base-url"] ?? file.baseUrl ?? DEFAULT_BASE_URL';
	L.push(`\tconst baseUrl = ${baseUrlExpr};`);
	for (const h of extraHeaders) {
		L.push(
			`\tconst ${h.option} = flags[${JSON.stringify(h.flag)}] ?? process.env.${h.env} ?? file.${h.option};`,
		);
	}
	const ret = ["apiKey", "baseUrl", ...extraHeaders.map((h) => h.option)].join(", ");
	L.push(`\treturn { ${ret} };`);
	L.push("}");
	return `${L.join("\n")}\n`;
}

export function loginTs(cfg: ResolvedConfig): string {
	const { apiKeyEnv } = cfg.auth;
	const L: string[] = [];
	L.push("/** Store API credentials for later commands. */");
	L.push('import { readFileSync } from "node:fs";');
	L.push('import { BaseCommand } from "../base.js";');
	L.push(
		'import { DEFAULT_BASE_URL, configPath, loadConfigFile, saveConfigFile } from "../lib/config.js";',
	);
	L.push("");
	L.push("function readStdin(): string | undefined {");
	L.push("\tif (process.stdin.isTTY) return undefined;");
	L.push("\ttry {");
	L.push('\t\tconst piped = readFileSync(0, "utf8").trim();');
	L.push("\t\treturn piped || undefined;");
	L.push("\t} catch {");
	L.push("\t\treturn undefined;");
	L.push("\t}");
	L.push("}");
	L.push("");
	L.push("export default class Login extends BaseCommand {");
	L.push(`\tstatic description = ${JSON.stringify(`Store your ${cfg.displayName} API key for future commands.`)};`);
	L.push("");
	L.push("\tasync run(): Promise<void> {");
	L.push("\t\tconst { flags } = await this.parse(Login);");
	L.push(`\t\tconst apiKey = flags["api-key"] ?? process.env.${apiKeyEnv} ?? readStdin();`);
	L.push("\t\tif (!apiKey) {");
	L.push(
		`\t\t\tthis.error(${JSON.stringify("Provide a key with --api-key, the environment, or by piping it in.")}, { exit: 1 });`,
	);
	L.push("\t\t}");
	L.push("\t\tconst existing = loadConfigFile();");
	L.push("\t\tsaveConfigFile({");
	L.push("\t\t\tapiKey,");
	L.push('\t\t\tbaseUrl: flags["base-url"] ?? existing.baseUrl,');
	for (const h of cfg.auth.extraHeaders) {
		L.push(`\t\t\t${h.option}: flags[${JSON.stringify(h.flag)}] ?? existing.${h.option},`);
	}
	L.push("\t\t});");
	L.push("\t\tthis.log(`Saved credentials to ${configPath()}`);");
	L.push("\t\tthis.log(`Base URL: ${flags[\"base-url\"] ?? existing.baseUrl ?? DEFAULT_BASE_URL}`);");
	L.push("\t}");
	L.push("}");
	return `${L.join("\n")}\n`;
}

export function logoutTs(): string {
	return [
		"/** Remove stored credentials. */",
		'import { BaseCommand } from "../base.js";',
		'import { configPath, deleteConfigFile } from "../lib/config.js";',
		"",
		"export default class Logout extends BaseCommand {",
		'\tstatic description = "Delete stored credentials.";',
		"",
		"\tasync run(): Promise<void> {",
		"\t\tconst removed = deleteConfigFile();",
		'\t\tthis.log(removed ? `Removed ${configPath()}` : "No stored credentials to remove.");',
		"\t}",
		"}",
		"",
	].join("\n");
}

export function whoamiTs(cfg: ResolvedConfig): string {
	const L: string[] = [];
	L.push("/** Show the configured credentials (API key masked). */");
	L.push('import { BaseCommand } from "../base.js";');
	L.push('import { resolveAuth } from "../lib/config.js";');
	L.push("");
	L.push("function mask(key: string): string {");
	L.push('\tif (key.length <= 12) return "****";');
	L.push("\treturn `${key.slice(0, 8)}…${key.slice(-4)}`;");
	L.push("}");
	L.push("");
	L.push("export default class Whoami extends BaseCommand {");
	L.push(`\tstatic description = ${JSON.stringify("Show the currently configured credentials (API key masked).")};`);
	L.push("");
	L.push("\tasync run(): Promise<void> {");
	L.push("\t\tconst { flags } = await this.parse(Whoami);");
	L.push("\t\ttry {");
	L.push("\t\t\tconst auth = resolveAuth(flags);");
	L.push("\t\t\tthis.log(`API key:  ${mask(auth.apiKey)}`);");
	L.push("\t\t\tthis.log(`Base URL: ${auth.baseUrl}`);");
	for (const h of cfg.auth.extraHeaders) {
		L.push(
			`\t\t\tthis.log(\`${h.header}: \${auth.${h.option} ?? "(none)"}\`);`,
		);
	}
	L.push("\t\t} catch (err) {");
	L.push("\t\t\tthis.error((err as Error).message, { exit: 1 });");
	L.push("\t\t}");
	L.push("\t}");
	L.push("}");
	return `${L.join("\n")}\n`;
}
