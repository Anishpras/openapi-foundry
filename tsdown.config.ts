import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/index.ts", "src/cli.ts"],
	format: ["esm"],
	dts: true,
	clean: true,
	// Kubb plugins + jiti are real runtime dependencies; keep them external so
	// they resolve from the published package's node_modules.
	external: [/^@kubb\//, "jiti"],
});
