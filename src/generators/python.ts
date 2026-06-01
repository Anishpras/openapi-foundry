/**
 * Python artifact generator. Writes the templated pyproject + auth wrapper + MCP
 * module, then runs openapi-python-client (via uvx) to emit the low-level client
 * under <pkg>/_client, and bundles the spec as package data for the MCP server.
 *
 * Python f-strings use `{}` (not `${}`), so these templates are safe to build
 * with JS template literals interpolating the config.
 */

import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ResolvedConfig } from "../config.js";
import { run, step, writeUnder } from "../util.js";

const OPC_VERSION = "0.24.2";

function clientTypeName(cfg: ResolvedConfig): string {
	const base = cfg.displayName.replace(/[^a-zA-Z0-9]/g, "") || "Api";
	return /^[0-9]/.test(base) ? `Api${base}` : base;
}

function pyproject(cfg: ResolvedConfig): string {
	return `[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = "${cfg.pythonPackage}"
version = "0.1.0"
description = "Official Python SDK and MCP server for the ${cfg.displayName} API (generated from OpenAPI)."
readme = "README.md"
requires-python = ">=3.10"
license = "MIT"
dependencies = [
  "httpx>=0.23.1,<0.29",
  "attrs>=22.2.0",
  "python-dateutil>=2.8.0",
]

[project.optional-dependencies]
mcp = ["fastmcp>=2.8,<3"]

[project.scripts]
${cfg.cliBin}-mcp = "${cfg.pythonPackage}.mcp:main"

[tool.hatch.build.targets.wheel]
packages = ["src/${cfg.pythonPackage}"]

[dependency-groups]
dev = ["openapi-python-client>=0.24,<0.25"]
`;
}

function initPy(cfg: ResolvedConfig): string {
	const cls = clientTypeName(cfg);
	const { apiKeyEnv, baseUrlEnv, extraHeaders } = cfg.auth;

	const ctorParams = ["api_key: str | None = None", "*", "base_url: str | None = None"];
	for (const h of extraHeaders) ctorParams.push(`${h.option}: str | None = None`);

	const envLines: string[] = [];
	for (const h of extraHeaders) {
		envLines.push(`        ${h.option} = ${h.option} or os.environ.get(${JSON.stringify(h.env)})`);
	}
	const headerLines: string[] = [];
	for (const h of extraHeaders) {
		headerLines.push(`        if ${h.option}:`);
		headerLines.push(`            headers[${JSON.stringify(h.header)}] = ${h.option}`);
	}

	const baseUrlExpr = baseUrlEnv
		? `base_url or os.environ.get(${JSON.stringify(baseUrlEnv)}) or DEFAULT_BASE_URL`
		: "base_url or DEFAULT_BASE_URL";

	const configureParams = ["api_key: str | None = None", "*", "base_url: str | None = None"];
	for (const h of extraHeaders) configureParams.push(`${h.option}: str | None = None`);
	const configureForward = ["api_key", "base_url=base_url", ...extraHeaders.map((h) => `${h.option}=${h.option}`)];

	return `"""Official Python SDK for the ${cfg.displayName} API.

The typed surface under ${cfg.pythonPackage}._client is generated from the
OpenAPI spec (openapi-python-client: attrs + httpx); this module adds auth.

Usage::

    import ${cfg.pythonPackage}
    from ${cfg.pythonPackage} import api

    client = ${cfg.pythonPackage}.configure(api_key="...")
    result = api.<topic>.<operation>.sync(client=client.raw)
"""

from __future__ import annotations

import importlib
import os
import pkgutil

from ${cfg.pythonPackage}._client import api, errors, models, types
from ${cfg.pythonPackage}._client.client import AuthenticatedClient, Client

# Eagerly import the per-topic api submodules so attribute access like
# ${cfg.pythonPackage}.api.<topic>.<operation> works without a separate import.
for _info in pkgutil.walk_packages(api.__path__, prefix=f"{api.__name__}."):
    importlib.import_module(_info.name)
del importlib, pkgutil, _info

__all__ = [
    "${cls}",
    "AuthenticatedClient",
    "Client",
    "configure",
    "get_client",
    "DEFAULT_BASE_URL",
    "api",
    "models",
    "errors",
    "types",
]

DEFAULT_BASE_URL = "${cfg.baseUrl}"


class ${cls}:
    """A configured client: auth + optional default headers.

    Wraps the generated AuthenticatedClient, injecting Authorization and any
    configured extra headers on every request. Pass .raw to operation functions.
    """

    def __init__(
        self,
        ${ctorParams.join(",\n        ")},
    ) -> None:
        api_key = api_key or os.environ.get(${JSON.stringify(apiKeyEnv)})
        if not api_key:
            raise ValueError(
                "An API key is required: pass api_key= or set ${apiKeyEnv}."
            )
        base_url = ${baseUrlExpr}
${envLines.join("\n")}
        headers: dict[str, str] = {}
${headerLines.join("\n")}
        self.base_url = base_url
        self._client = AuthenticatedClient(base_url=base_url, token=api_key, headers=headers)

    @property
    def raw(self) -> AuthenticatedClient:
        """The underlying generated client to pass to operation functions."""
        return self._client


_default: ${cls} | None = None


def configure(
    ${configureParams.join(",\n    ")},
) -> ${cls}:
    """Create and remember a process-global client (see get_client)."""
    global _default
    _default = ${cls}(${configureForward.join(", ")})
    return _default


def get_client() -> AuthenticatedClient:
    """Return the raw client configured via configure() (else raise)."""
    if _default is None:
        raise RuntimeError("${cfg.pythonPackage} is not configured — call ${cfg.pythonPackage}.configure(...) first.")
    return _default.raw
`;
}

function mcpPy(cfg: ResolvedConfig): string {
	const { apiKeyEnv, baseUrlEnv, extraHeaders } = cfg.auth;
	const baseUrlExpr = baseUrlEnv
		? `os.environ.get(${JSON.stringify(baseUrlEnv)}, DEFAULT_BASE_URL)`
		: "DEFAULT_BASE_URL";
	const headerLines = extraHeaders
		.map(
			(h) =>
				`    _v = os.environ.get(${JSON.stringify(h.env)})\n    if _v:\n        headers[${JSON.stringify(h.header)}] = _v`,
		)
		.join("\n");

	return `"""Python MCP server for the ${cfg.displayName} API (FastMCP from_openapi)."""

from __future__ import annotations

import json
import os
from importlib import resources
from typing import Any

DEFAULT_BASE_URL = "${cfg.baseUrl}"


def _load_spec() -> dict[str, Any]:
    spec_file = resources.files("${cfg.pythonPackage}").joinpath("spec/openapi.json")
    with spec_file.open("r", encoding="utf-8") as f:
        return json.load(f)


def build_server():  # -> fastmcp.FastMCP
    try:
        import httpx
        from fastmcp import FastMCP
    except ModuleNotFoundError as exc:  # pragma: no cover
        raise SystemExit(
            "The MCP server needs the 'mcp' extra: pip install '${cfg.pythonPackage}[mcp]'"
        ) from exc

    api_key = os.environ.get(${JSON.stringify(apiKeyEnv)})
    if not api_key:
        raise SystemExit("${apiKeyEnv} is required to run the MCP server.")

    base_url = ${baseUrlExpr}
    headers = {"Authorization": f"Bearer {api_key}"}
${headerLines}

    client = httpx.AsyncClient(base_url=base_url, headers=headers)
    return FastMCP.from_openapi(openapi_spec=_load_spec(), client=client, name="${cfg.displayName}")


def main() -> None:
    build_server().run()


if __name__ == "__main__":
    main()
`;
}

function readmePy(cfg: ResolvedConfig): string {
	return `# ${cfg.pythonPackage}

Official Python SDK and MCP server for the ${cfg.displayName} API, generated from
OpenAPI by openapi-foundry.

\`\`\`bash
pip install ${cfg.pythonPackage}          # SDK
pip install '${cfg.pythonPackage}[mcp]'   # SDK + MCP server (${cfg.cliBin}-mcp)
\`\`\`
`;
}

export async function generatePython(cfg: ResolvedConfig): Promise<string> {
	const dir = join(cfg.outRoot, "python", cfg.pythonPackage);
	const pkgDir = join(dir, "src", cfg.pythonPackage);
	step(`Python → ${cfg.pythonPackage} (SDK + MCP)`);

	writeUnder(dir, "pyproject.toml", pyproject(cfg));
	writeUnder(dir, "README.md", readmePy(cfg));
	writeUnder(dir, join("src", cfg.pythonPackage, "__init__.py"), initPy(cfg));
	writeUnder(dir, join("src", cfg.pythonPackage, "mcp.py"), mcpPy(cfg));
	writeUnder(dir, join("src", cfg.pythonPackage, "py.typed"), "");

	// Generate the low-level client into a temp dir (--meta none writes the
	// package contents directly), then move it to <pkg>/_client.
	const tmp = mkdtempSync(join(tmpdir(), "of-py-"));
	const tmpOut = join(tmp, "_client");
	try {
		await run("uvx", [
			`openapi-python-client@${OPC_VERSION}`,
			"generate",
			"--path",
			cfg.specPath,
			"--meta",
			"none",
			"--output-path",
			tmpOut,
			"--overwrite",
		]);
		rmSync(join(tmpOut, ".ruff_cache"), { recursive: true, force: true });
		const genDir = join(pkgDir, "_client");
		rmSync(genDir, { recursive: true, force: true });
		cpSync(tmpOut, genDir, { recursive: true });
	} finally {
		rmSync(tmp, { recursive: true, force: true });
	}

	// Bundle the spec for the MCP server (importlib.resources at runtime).
	cpSync(cfg.specPath, join(pkgDir, "spec", "openapi.json"));
	return dir;
}
