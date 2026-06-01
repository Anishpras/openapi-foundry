#!/usr/bin/env node
// Post-build: rename the hashed bundled declaration (dist/index-<hash>.d.ts)
// to the stable dist/index.d.ts that package.json `types` points at. tsdown
// 0.12.x emits the bundled .d.ts as a hashed chunk; it is self-contained, so
// renaming is safe. (The cli entry's hashed .d.ts is not referenced and is
// left as-is.)
import { readdirSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const distDir = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const hashed = readdirSync(distDir).filter((f) => /^index-.*\.d\.ts$/.test(f));

if (hashed.length === 1) {
	renameSync(join(distDir, hashed[0]), join(distDir, "index.d.ts"));
	console.log(`Renamed ${hashed[0]} -> index.d.ts`);
} else if (hashed.length > 1) {
	throw new Error(`Expected one hashed index declaration, found ${hashed.length}`);
}
