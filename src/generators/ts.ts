/**
 * TypeScript artifact generators (SDK + MCP). Each writes its templated source
 * (the shared client.ts, the auth-aware entry point, package.json, tsconfig,
 * tsdown config) then runs Kubb programmatically to emit src/gen — so the
 * consumer never needs the Kubb toolchain installed.
 */

import { join } from "node:path";
import { build } from "@kubb/core";
import { pluginClient } from "@kubb/plugin-client";
import { pluginMcp } from "@kubb/plugin-mcp";
import { pluginOas } from "@kubb/plugin-oas";
import { pluginTs } from "@kubb/plugin-ts";
import { pluginZod } from "@kubb/plugin-zod";
import type { ResolvedConfig } from "../config.js";
import {
	CLIENT_TS_B64,
	FIX_DTS_B64,
	MCP_TSDOWN_B64,
	SDK_TSDOWN_B64,
	decode,
} from "../templates/static.js";
import {
	mcpIndexTs,
	mcpPackageJson,
	sdkIndexTs,
	sdkPackageJson,
	tsconfigJson,
} from "../templates/ts.js";
import { step, writeUnder } from "../util.js";

// The generated client functions import the custom fetch client at ../../client
// (from src/gen/client/<op>.ts → src/client.ts).
const CLIENT_IMPORT = "../../client";

async function runKubb(pkgDir: string, specPath: string, withMcp: boolean): Promise<void> {
	// biome-ignore lint/suspicious/noExplicitAny: kubb plugin array is loosely typed across plugins
	const plugins: any[] = [
		pluginOas({ validate: false }),
		pluginTs({ output: { path: "types" } }),
		pluginZod({ output: { path: "zod" } }),
		pluginClient({
			output: { path: "client" },
			importPath: CLIENT_IMPORT,
			dataReturnType: "data",
		}),
	];
	if (withMcp) {
		plugins.push(
			pluginMcp({
				output: { path: "mcp" },
				client: { importPath: CLIENT_IMPORT, dataReturnType: "data" },
			}),
		);
	}
	await build({
		config: {
			root: pkgDir,
			input: { path: specPath },
			output: { path: "./src/gen", clean: true },
			plugins,
		},
	});
}

export async function generateTsSdk(cfg: ResolvedConfig): Promise<string> {
	const dir = join(cfg.outRoot, "packages", "sdk");
	step(`TS SDK → ${cfg.packages.sdk}`);
	writeUnder(dir, "package.json", sdkPackageJson(cfg));
	writeUnder(dir, "tsconfig.json", tsconfigJson());
	writeUnder(dir, "tsdown.config.ts", decode(SDK_TSDOWN_B64));
	writeUnder(dir, "src/client.ts", decode(CLIENT_TS_B64));
	writeUnder(dir, "src/index.ts", sdkIndexTs(cfg));
	writeUnder(dir, "scripts/fix-dts.mjs", decode(FIX_DTS_B64));
	await runKubb(dir, cfg.specPath, false);
	return dir;
}

export async function generateTsMcp(cfg: ResolvedConfig): Promise<string> {
	const dir = join(cfg.outRoot, "packages", "mcp");
	step(`TS MCP → ${cfg.packages.mcp}`);
	writeUnder(dir, "package.json", mcpPackageJson(cfg));
	writeUnder(dir, "tsconfig.json", tsconfigJson());
	writeUnder(dir, "tsdown.config.ts", decode(MCP_TSDOWN_B64));
	writeUnder(dir, "src/client.ts", decode(CLIENT_TS_B64));
	writeUnder(dir, "src/index.ts", mcpIndexTs(cfg));
	await runKubb(dir, cfg.specPath, true);
	return dir;
}
