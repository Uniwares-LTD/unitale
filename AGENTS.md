# Engineering guidance

## Start here

At task start run `npm run handbook:check` (or `node scripts/handbook.mjs check`)
outside the sandbox. Run all Git/MCP/gh calls and helpers that invoke them outside
the sandbox from the first attempt; follow [GitHub access](.agents/repository-adapter.md#github-access).
Use `npm.cmd` / `npx.cmd` on Windows when PowerShell wrappers are blocked.

Read the [Handbook bootstrap](.agents/handbook.md), this repository's
[adapter](.agents/repository-adapter.md), [source map](docs/source-map.md),
[preferences](.agents/repository.md) and `handbook.json`. Retain the returned
Handbook path/revision for the task and handoffs. The bootstrap owns setup,
recovery and committed resource reads; do not edit its managed content.
Without usable shared guidance, continue under local rules and pause only
dependent decisions. See [agent tooling](docs/agent-tooling.md) for integration maintenance.

Read the [current implementation plan](docs/implementation-plan.md) and relevant
code before editing. The user's request and accepted milestones define scope;
accepted milestones need no retroactive issues. Shared guidance does not transfer ownership or expand authority.
Preserve local adaptations and resolve actual conflicts explicitly.

For booklet model, schema or persistence changes, update the
[model guide, JSON example and both Mermaid schema versions](docs/features/booklet-generation/model.md) in the same
change, or record why they are unaffected. Keep proposals distinct from implemented
contracts and run `npm run docs:booklet-model` followed by `npm run check:docs`.

## Decision-point rules

- Commits, pushes, PR publication, merges, deployments, releases, permissions and
  project configuration changes need explicit session authorization. New issues
  need human approval; humans own closure and Done. See the adapter's
  [authority rules](.agents/repository-adapter.md#publication-and-external-actions).
- Use one Next.js App Router application for web and the planned Android TWA.
  Keep private access in `src/lib/server` with `server-only` imports; allowlist
  public configuration. Never serialize process.env, credentials or private
  configuration to the browser. Local operation must work without cloud credentials.
- Preserve accepted Run/accounting records and ownership boundaries. Read
  [service contracts](docs/services.md) before changing them, and
  [MCP guidance](docs/mcp.md) before changing tools or transport.
- Public UI uses typed catalogs, page-scoped dictionaries and logical RTL styles;
  administration stays English/LTR without changing the public language preference.
  Preserve CSP nonces during navigation. Reuse shadcn primitives through the CLI
  and semantic theme variables. Follow the adapter's [UI checks](.agents/repository-adapter.md#ui-and-browser-verification).
- For UI work use the local `build-ui` skill and the adopted
  [design system](docs/design-system.md): existing primitives, `Field`, `SubmitButton`,
  toast, leave guard and type roles first. New dependencies, CSP changes and visible
  colour or typography changes to existing screens need explicit approval.
- Before deployment/provider work, read the adapter's
  [operational boundaries](.agents/repository-adapter.md#deployment-and-provider-work)
  and [deployment guidance](docs/deployment.md#current-staging-release).
  Publication does not authorize live changes.
- Run affected checks and a separate read-only review. Quality warnings are
  advisory; compilation, bundling, runtime and operational failures remain failures.
  Use the adapter's [verification rules](.agents/repository-adapter.md#validation-and-review).

## Shared workflows and maintenance

Apply shared communication guidance and the proportional engineering workflow at
the task revision. Read only the relevant selected skills from `handbook.json`;
system-provided skills remain system-owned. Shared procedures belong in Handbook,
local exceptions in the adapter, and source navigation in the source map.

Start new artifacts from the permissive templates in `.github` and `docs/templates`,
falling back to shared starters. After skill metadata or routing changes, run
`npm run handbook:sync` and `npm run handbook:entrypoints`; preserve custom
content and refresh integrity hashes only after review. Normal refresh never
rewrites instructions. Follow [integration maintenance](docs/agent-tooling.md#explicit-integration-updates).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
