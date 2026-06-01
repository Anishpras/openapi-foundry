import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** Write `content` to `path`, creating parent directories as needed. */
export function writeFile(path: string, content: string): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, content.endsWith("\n") ? content : `${content}\n`);
}

/** Write a file relative to a base directory. */
export function writeUnder(baseDir: string, relPath: string, content: string): void {
	writeFile(join(baseDir, relPath), content);
}

export function readJson<T = unknown>(path: string): T {
	return JSON.parse(readFileSync(path, "utf8")) as T;
}

let _quiet = false;
export function setQuiet(q: boolean): void {
	_quiet = q;
}
export function log(message: string): void {
	if (!_quiet) process.stdout.write(`${message}\n`);
}
export function step(message: string): void {
	log(`▸ ${message}`);
}

/** Run a command, inheriting stdio, rejecting on non-zero exit. */
export function run(cmd: string, args: string[], cwd?: string): Promise<void> {
	return new Promise((resolvePromise, reject) => {
		const child = spawn(cmd, args, { cwd, stdio: _quiet ? "ignore" : "inherit" });
		child.on("error", reject);
		child.on("close", (code) => {
			if (code === 0) resolvePromise();
			else reject(new Error(`${cmd} ${args.join(" ")} exited with code ${code}`));
		});
	});
}
