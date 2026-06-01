import { defineConfig } from "openapi-foundry";

/**
 * Example: the config that reproduces the example AI v3 artifacts
 * (TS SDK, MCP, CLI, Python SDK/MCP). Point `spec` at your local copy.
 */
export default defineConfig({
	spec: "./openapi.json",
	outDir: "./generated",
	displayName: "example AI",
	name: "exampleai",
	npmScope: "@exampleai",
	cliBin: "exampleai",
	pythonPackage: "exampleai",
	baseUrl: "https://api.example.ai",
	auth: {
		apiKeyEnv: "example_API_KEY",
		baseUrlEnv: "example_BASE_URL",
		extraHeaders: [
			{
				header: "X-Subaccount-Id",
				env: "example_SUBACCOUNT_ID",
				option: "subaccountId",
				flag: "subaccount",
				flagChar: "s",
				description: "Target subaccount id",
			},
		],
	},
	artifacts: ["ts-sdk", "ts-mcp", "cli", "python"],
});
