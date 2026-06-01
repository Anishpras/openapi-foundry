import { defineConfig } from "openapi-foundry";

/**
 * Example: the config that reproduces the Assistable AI v3 artifacts
 * (TS SDK, MCP, CLI, Python SDK/MCP). Point `spec` at your local copy.
 */
export default defineConfig({
	spec: "./openapi.json",
	outDir: "./generated",
	displayName: "Assistable AI",
	name: "assistableai",
	npmScope: "@assistableai",
	cliBin: "assistableai",
	pythonPackage: "assistableai",
	baseUrl: "https://api.assistable.ai",
	auth: {
		apiKeyEnv: "ASSISTABLE_API_KEY",
		baseUrlEnv: "ASSISTABLE_BASE_URL",
		extraHeaders: [
			{
				header: "X-Subaccount-Id",
				env: "ASSISTABLE_SUBACCOUNT_ID",
				option: "subaccountId",
				flag: "subaccount",
				flagChar: "s",
				description: "Target subaccount id",
			},
		],
	},
	artifacts: ["ts-sdk", "ts-mcp", "cli", "python"],
});
