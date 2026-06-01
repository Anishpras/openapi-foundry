/**
 * Foundry configuration — one object describes how to turn a single OpenAPI
 * spec into a TS SDK, MCP server, CLI, and Python SDK/MCP. The auth section is
 * the important bit: it's templated consistently into the TS fetch client, the
 * MCP bin glue, the CLI's global flags + credential resolution, and the Python
 * wrapper, so every artifact authenticates the same way.
 */

import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** An extra header sent on every request (e.g. a tenant / subaccount id). */
export interface ExtraHeader {
	/** HTTP header name, e.g. `X-Subaccount-Id`. */
	header: string;
	/** Environment variable the MCP server / CLI reads to populate it. */
	env: string;
	/** camelCase option name on the SDK `configure()` call, e.g. `subaccountId`. */
	option: string;
	/** Long CLI flag name, e.g. `subaccount` (defaults to `option` kebab-cased). */
	flag?: string;
	/** Optional short CLI flag char, e.g. `s`. */
	flagChar?: string;
	/** Human description shown in help. */
	description?: string;
}

export interface AuthConfig {
	/** Only `bearer` (Authorization: Bearer <key>) is supported today. */
	scheme?: "bearer";
	/** Environment variable holding the API key. */
	apiKeyEnv: string;
	/** Environment variable that overrides the base URL (optional). */
	baseUrlEnv?: string;
	/** Extra headers applied to every request (e.g. subaccount id). */
	extraHeaders?: ExtraHeader[];
}

export type Artifact = "ts-sdk" | "ts-mcp" | "cli" | "python";

export const ALL_ARTIFACTS: Artifact[] = ["ts-sdk", "ts-mcp", "cli", "python"];

export interface FoundryConfig {
	/** Path to the OpenAPI spec JSON, relative to the config file. */
	spec: string;
	/** Output root for generated artifacts, relative to the config file. */
	outDir: string;
	/** Product display name, e.g. `Assistable AI`. */
	displayName: string;
	/** Base slug used for package names, e.g. `assistableai`. */
	name: string;
	/** npm scope for the TS packages, e.g. `@assistableai`. */
	npmScope: string;
	/** CLI binary name (defaults to `name`). */
	cliBin?: string;
	/** Python distribution name (defaults to `name`). */
	pythonPackage?: string;
	/** Default API base URL. */
	baseUrl: string;
	/** Authentication wiring shared across all artifacts. */
	auth: AuthConfig;
	/** Which artifacts to generate (defaults to all four). */
	artifacts?: Artifact[];
}

/** Identity helper that gives editors type-checking + autocomplete. */
export function defineConfig(config: FoundryConfig): FoundryConfig {
	return config;
}

export interface ResolvedExtraHeader extends Required<Omit<ExtraHeader, "flagChar" | "description">> {
	flagChar?: string;
	description: string;
}

export interface ResolvedConfig extends FoundryConfig {
	configDir: string;
	specPath: string;
	outRoot: string;
	cliBin: string;
	pythonPackage: string;
	artifacts: Artifact[];
	auth: Required<Pick<AuthConfig, "scheme" | "apiKeyEnv">> &
		AuthConfig & { extraHeaders: ResolvedExtraHeader[] };
	/** npm package names per TS artifact. */
	packages: { sdk: string; mcp: string; cli: string };
}

function kebab(s: string): string {
	return s
		.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
		.replace(/[_\s]+/g, "-")
		.toLowerCase();
}

export function resolveConfig(config: FoundryConfig, configDir: string): ResolvedConfig {
	if (!config.spec) throw new Error("config.spec is required");
	if (!config.outDir) throw new Error("config.outDir is required");
	if (!config.npmScope?.startsWith("@")) throw new Error("config.npmScope must start with '@'");
	if (!config.auth?.apiKeyEnv) throw new Error("config.auth.apiKeyEnv is required");

	const specPath = isAbsolute(config.spec) ? config.spec : resolve(configDir, config.spec);
	if (!existsSync(specPath)) throw new Error(`Spec not found at ${specPath}`);

	const outRoot = isAbsolute(config.outDir) ? config.outDir : resolve(configDir, config.outDir);

	const extraHeaders: ResolvedExtraHeader[] = (config.auth.extraHeaders ?? []).map((h) => ({
		header: h.header,
		env: h.env,
		option: h.option,
		flag: h.flag ?? kebab(h.option),
		flagChar: h.flagChar,
		description: h.description ?? `Value for the ${h.header} header.`,
	}));

	return {
		...config,
		configDir,
		specPath,
		outRoot,
		cliBin: config.cliBin ?? config.name,
		pythonPackage: config.pythonPackage ?? config.name.replace(/-/g, "_"),
		artifacts: config.artifacts ?? ALL_ARTIFACTS,
		auth: {
			scheme: config.auth.scheme ?? "bearer",
			apiKeyEnv: config.auth.apiKeyEnv,
			baseUrlEnv: config.auth.baseUrlEnv,
			extraHeaders,
		},
		packages: {
			sdk: `${config.npmScope}/sdk`,
			mcp: `${config.npmScope}/mcp`,
			cli: `${config.npmScope}/cli`,
		},
	};
}

/** Load + resolve a config from a `.ts`/`.mjs`/`.js`/`.json` file via jiti. */
export async function loadConfig(configPath: string): Promise<ResolvedConfig> {
	const abs = isAbsolute(configPath) ? configPath : resolve(process.cwd(), configPath);
	if (!existsSync(abs)) throw new Error(`Config file not found: ${abs}`);

	const { createJiti } = await import("jiti");
	const jiti = createJiti(pathToFileURL(abs).href);
	const mod = await jiti.import<{ default?: FoundryConfig } & FoundryConfig>(abs);
	const config = (mod.default ?? mod) as FoundryConfig;

	return resolveConfig(config, dirname(abs));
}
