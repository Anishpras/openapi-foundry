# openapi-foundry

Generate a **TypeScript SDK**, **MCP server**, branded **CLI**, and a **Python SDK + MCP server** from a single OpenAPI spec and one config file — with the custom fetch client and `{ data, error, request_id }` response-envelope handling **templated consistently** across every artifact.

Existing generators each do one language or one artifact. openapi-foundry orchestrates several proven open-source generators behind one config so a whole client ecosystem stays in sync with the spec:

| Artifact | Built with |
|---|---|
| TS SDK (`@scope/sdk`) | [Kubb](https://kubb.dev) (run programmatically) + a deep-merging fetch client |
| TS MCP server (`@scope/mcp`) | Kubb `plugin-mcp` over the same client |
| CLI (`<bin>`) | [oclif](https://oclif.io) — one command per operation, generated from the spec |
| Python SDK + MCP (`<pkg>`) | [openapi-python-client](https://github.com/openapi-generators/openapi-python-client) + [FastMCP](https://gofastmcp.com) |

## Install

```bash
npm install -D openapi-foundry
```

## Use

```bash
npx openapi-foundry init           # write an example config
# edit openapi-foundry.config.ts, point `spec` at your OpenAPI JSON
npx openapi-foundry generate       # emit all configured artifacts into outDir
```

```ts
// openapi-foundry.config.ts
import { defineConfig } from "openapi-foundry";

export default defineConfig({
  spec: "./openapi.json",
  outDir: "./generated",
  displayName: "Acme",
  name: "acme",
  npmScope: "@acme",
  baseUrl: "https://api.acme.com",
  auth: {
    apiKeyEnv: "ACME_API_KEY",
    baseUrlEnv: "ACME_BASE_URL",
    extraHeaders: [
      { header: "X-Tenant-Id", env: "ACME_TENANT_ID", option: "tenantId", flag: "tenant", flagChar: "t" },
    ],
  },
  artifacts: ["ts-sdk", "ts-mcp", "cli", "python"],
});
```

The `auth` block is the point of the tool: it's woven into the SDK's `configure()`, the MCP server's env→headers glue, the CLI's global flags + credential store, and the Python wrapper — so every artifact authenticates identically. Each operation's response is returned as the full typed envelope; an `extraHeaders` entry (e.g. a tenant/subaccount id) becomes a `configure()` option, an `X-…` header, a CLI flag, and an env var everywhere at once.

Output is a pnpm workspace under `outDir` (`packages/sdk`, `packages/mcp`, `packages/cli`) plus a standalone `python/<pkg>` (uv + hatchling). Generated code is ready to `pnpm install && pnpm -r build`.

## License

MIT
