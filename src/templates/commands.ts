/**
 * Spec → oclif command generator (ported from the reference CLI's
 * scripts/generate.mjs). Reads the OpenAPI spec and writes one command file per
 * operation plus a manifest, into the generated CLI package. The orchestrator
 * runs this directly, so the generated CLI ships no codegen script of its own.
 */

import { join } from "node:path";
import { readJson, writeUnder } from "../util.js";

const GEN_HEADER = "// AUTO-GENERATED from the OpenAPI spec by openapi-foundry — do not edit.\n";

function splitWords(s: string): string[] {
	return s
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
		.split(/[\s_]+/)
		.filter(Boolean)
		.map((w) => w.toLowerCase());
}
const kebab = (s: string) => splitWords(s).join("-");
const pascal = (s: string) =>
	splitWords(s)
		.map((w) => w[0].toUpperCase() + w.slice(1))
		.join("");
const singular = (w: string) =>
	w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w;
const topicSlug = (tag: string) =>
	tag
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

function deriveAction(operationId: string, tag: string): string {
	const tagWords = new Set(splitWords(tag).map(singular));
	const tokens = splitWords(operationId);
	const filtered = tokens.filter((t) => !tagWords.has(singular(t)));
	return (filtered.length ? filtered : tokens).join("-");
}

type ParamType = "string" | "integer" | "number" | "boolean";

function paramType(schema: Record<string, unknown> = {}): { type: ParamType; array: boolean } {
	let type = "string";
	let array = false;
	if (schema.type === "array") {
		array = true;
		const items = schema.items as Record<string, unknown> | undefined;
		type = (items?.type as string) || "string";
	} else if (schema.type) {
		type = schema.type as string;
	}
	if (!["integer", "number", "boolean", "string"].includes(type)) type = "string";
	return { type: type as ParamType, array };
}

interface OpMeta {
	operationId: string;
	method: string;
	path: string;
	tag: string;
	topic: string;
	action: string;
	summary?: string;
	description?: string;
	pathParams: { name: string; description?: string }[];
	queryParams: { name: string; type: ParamType; required: boolean; array: boolean; description?: string }[];
	hasBody: boolean;
}

function argDef(p: { description?: string }): string {
	const opts: string[] = [];
	if (p.description) opts.push(`description: ${JSON.stringify(p.description)}`);
	opts.push("required: true");
	return `Args.string({ ${opts.join(", ")} })`;
}

function flagDef(p: OpMeta["queryParams"][number]): string {
	const opts: string[] = [];
	if (p.description) opts.push(`description: ${JSON.stringify(p.description)}`);
	if (p.required) opts.push("required: true");
	let kind: string;
	if (p.array) {
		kind = "string";
		opts.push("multiple: true");
	} else if (p.type === "boolean") {
		kind = "boolean";
	} else if (p.type === "integer") {
		kind = "integer";
	} else {
		kind = "string";
	}
	return `Flags.${kind}({ ${opts.join(", ")} })`;
}

function commandFile(op: OpMeta): string {
	const cls = pascal(op.operationId);
	const hasArgs = op.pathParams.length > 0;
	const hasFlags = op.queryParams.length > 0;
	const oclifNamed = [hasArgs && "Args", hasFlags && "Flags"].filter(Boolean);

	const L: string[] = [GEN_HEADER.trimEnd()];
	if (oclifNamed.length) L.push(`import { ${oclifNamed.join(", ")} } from "@oclif/core";`);
	L.push('import { BaseCommand } from "../../base.js";');
	L.push('import { runOperation } from "../../lib/invoke.js";');
	L.push('import type { CommandFlags } from "../../lib/config.js";');
	L.push("");

	const summary = op.summary || op.description || `${op.method} ${op.path}`;
	const description = op.description || summary;
	L.push(`export default class ${cls} extends BaseCommand {`);
	L.push(`\tstatic summary = ${JSON.stringify(summary)};`);
	L.push(`\tstatic description = ${JSON.stringify(description)};`);
	const example = `<%= config.bin %> ${op.topic} ${op.action}${op.pathParams.map((p) => ` <${p.name}>`).join("")}`;
	L.push(`\tstatic examples = [${JSON.stringify(example)}];`);
	if (hasArgs) {
		L.push("\tstatic args = {");
		for (const p of op.pathParams) L.push(`\t\t${JSON.stringify(p.name)}: ${argDef(p)},`);
		L.push("\t};");
	}
	if (hasFlags) {
		L.push("\tstatic flags = {");
		for (const p of op.queryParams) L.push(`\t\t${JSON.stringify(p.name)}: ${flagDef(p)},`);
		L.push("\t};");
	}
	L.push("");
	L.push("\tasync run(): Promise<void> {");
	L.push(`\t\tconst { args, flags } = await this.parse(${cls});`);
	L.push(
		`\t\tawait runOperation(${JSON.stringify(op.operationId)}, args as Record<string, string>, flags as CommandFlags);`,
	);
	L.push("\t}");
	L.push("}");
	return `${L.join("\n")}\n`;
}

/** Generate command files + manifest under `cliDir`. Returns the command count. */
export function generateCommands(specPath: string, cliDir: string): number {
	// biome-ignore lint/suspicious/noExplicitAny: OpenAPI document is loosely typed
	const spec = readJson<any>(specPath);
	const ops: OpMeta[] = [];
	for (const [path, methods] of Object.entries(spec.paths ?? {})) {
		for (const [method, op] of Object.entries(methods as Record<string, any>)) {
			if (!op || typeof op !== "object" || !op.operationId) continue;
			const tag: string = (op.tags && op.tags[0]) || "Misc";
			const params = (op.parameters ?? []) as Record<string, any>[];
			ops.push({
				operationId: op.operationId,
				method: method.toUpperCase(),
				path,
				tag,
				topic: topicSlug(tag),
				action: deriveAction(op.operationId, tag),
				summary: op.summary,
				description: op.description,
				pathParams: params
					.filter((p) => p.in === "path")
					.map((p) => ({ name: p.name, description: p.description })),
				queryParams: params
					.filter((p) => p.in === "query")
					.map((p) => ({
						name: p.name,
						required: !!p.required,
						description: p.description,
						...paramType(p.schema),
					})),
				hasBody: !!op.requestBody,
			});
		}
	}

	// Resolve action collisions within a topic via full kebab(operationId).
	const groups = new Map<string, OpMeta[]>();
	for (const op of ops) {
		const key = `${op.topic} ${op.action}`;
		const arr = groups.get(key) ?? [];
		arr.push(op);
		groups.set(key, arr);
	}
	for (const arr of groups.values()) {
		if (arr.length > 1) for (const op of arr) op.action = kebab(op.operationId);
	}

	ops.sort((a, b) =>
		a.topic === b.topic ? a.action.localeCompare(b.action) : a.topic.localeCompare(b.topic),
	);

	const manifest = ops.map((op) => {
		const meta = {
			operationId: op.operationId,
			method: op.method,
			path: op.path,
			topic: op.topic,
			action: op.action,
			summary: op.summary,
			description: op.description,
			pathParams: op.pathParams.map((p) => ({ name: p.name, description: p.description })),
			queryParams: op.queryParams.map((p) => ({
				name: p.name,
				type: p.type,
				required: p.required,
				array: p.array,
				description: p.description,
			})),
			hasBody: op.hasBody,
		};
		return `\t${JSON.stringify(meta)},`;
	});
	writeUnder(
		cliDir,
		"src/manifest.gen.ts",
		`${GEN_HEADER}import type { OperationMeta } from "./lib/types.js";\n\nexport const operations: OperationMeta[] = [\n${manifest.join("\n")}\n];\n`,
	);

	for (const op of ops) {
		writeUnder(cliDir, join("src/commands", op.topic, `${op.action}.ts`), commandFile(op));
	}
	return ops.length;
}
