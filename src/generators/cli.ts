/**
 * CLI artifact generator (oclif). Writes the templated entry/runtime/auth files
 * and the static runtime, then generates one command per operation from the
 * spec (so the published CLI ships no codegen step of its own).
 */

import { chmodSync } from "node:fs";
import { join } from "node:path";
import type { ResolvedConfig } from "../config.js";
import {
	baseTs,
	cliPackageJson,
	cliTsconfig,
	configTs,
	loginTs,
	logoutTs,
	sdkReexport,
	whoamiTs,
} from "../templates/cli.js";
import { generateCommands } from "../templates/commands.js";
import {
	BIN_DEV_JS_B64,
	BIN_RUN_JS_B64,
	INVOKE_TS_B64,
	RENDER_TS_B64,
	TYPES_TS_B64,
	decode,
} from "../templates/static.js";
import { log, step, writeUnder } from "../util.js";

export async function generateCli(cfg: ResolvedConfig): Promise<string> {
	const dir = join(cfg.outRoot, "packages", "cli");
	step(`CLI → ${cfg.packages.cli} (bin ${cfg.cliBin})`);

	writeUnder(dir, "package.json", cliPackageJson(cfg));
	writeUnder(dir, "tsconfig.json", cliTsconfig());
	writeUnder(dir, "bin/run.js", decode(BIN_RUN_JS_B64));
	writeUnder(dir, "bin/dev.js", decode(BIN_DEV_JS_B64));
	chmodSync(join(dir, "bin/run.js"), 0o755);
	chmodSync(join(dir, "bin/dev.js"), 0o755);

	writeUnder(dir, "src/base.ts", baseTs(cfg));
	writeUnder(dir, "src/lib/config.ts", configTs(cfg));
	writeUnder(dir, "src/lib/sdk.ts", sdkReexport(cfg));
	writeUnder(dir, "src/lib/invoke.ts", decode(INVOKE_TS_B64));
	writeUnder(dir, "src/lib/render.ts", decode(RENDER_TS_B64));
	writeUnder(dir, "src/lib/types.ts", decode(TYPES_TS_B64));
	writeUnder(dir, "src/commands/login.ts", loginTs(cfg));
	writeUnder(dir, "src/commands/logout.ts", logoutTs());
	writeUnder(dir, "src/commands/whoami.ts", whoamiTs(cfg));

	const count = generateCommands(cfg.specPath, dir);
	log(`  ${count} commands generated`);
	return dir;
}
