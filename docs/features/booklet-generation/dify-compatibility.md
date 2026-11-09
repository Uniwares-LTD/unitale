# Run the offline booklet compatibility harness

## Purpose

This document describes the preserved T02/v1 harness. The same suite command also
runs the current native YAML tests; their prerequisites and results live in the
[candidate README](workflow-package/README.md#verification). Target Dify/provider
checks follow the [compatibility runbook](workflow-package/integration-handoff.md#difyprovider-compatibility-procedure).

T02 checks candidate workflow contracts before T18–T20 implement production
specialists, reviewer and manager. It executes generated JavaScript Code nodes,
resolves graph selectors into fake adapter validators, and exercises Unitale's
existing Dify transport with an injected fetcher.

**This is offline contract compatibility, not Dify engine execution.** The graphs
are test candidates, not import-ready publications. No production workflow is
registered and no dispatcher, endpoint, database or accounting behavior changes.

## Prerequisites

Use the repository's Node 24 and installed locked npm dependencies. No `.env.local`,
secrets, database, Docker, running Dify or paid provider access is needed. The v1
tests need no Python; the native YAML tests require standard-library Python as
described in the candidate README.
The command does not use the application's environment-loading wrapper. Tests
replace global fetch with a rejecting guard; the transport receives only an
explicit, allowlisted fake fetcher. These guards cover the harness's HTTP paths,
not an operating-system network sandbox.

## Steps

From the Unitale root, run:

```powershell
npm.cmd run test:booklet-compat
```

On other shells, use `npm run test:booklet-compat`. The suite includes eleven
preserved v1 tests plus the native-package tests; the candidate README owns the
current total and reviewed identity.
An unexpected request, malformed output, unresolved selector or invalid reference
fails the suite. No credentials should be added to fix an offline failure.

## Compatibility report

| Identity | Evidence |
| --- | --- |
| Source revision | `baa9dda25c041b2d7a77853f9f6c3daa73161217` |
| Candidate graph identity | `unitale-booklet-candidates@1` |
| Fake adapter identity | `unitale-offline-adapters@1` |
| Fake models | `fake-text-v1`, `fake-image-v1`, `fake-reviewer-v1` |
| Local runtime exercised | Node 24.16.0; installed TypeScript/tsx and T01 Zod contracts |
| Dify engine versions tested here | None |
| Dify/plugin versions reported by source | Dify 1.17.1; source image candidate targets `openai_tool` 0.2.2; neither installed nor tested by T02 |

Source patterns come from
[real-workflow-graph.ts](https://github.com/karpishe-experiments/agentic-poc/blob/baa9dda25c041b2d7a77853f9f6c3daa73161217/lib/experiment-runner/real-workflow-graph.ts)
and the source's
[bounded image adapter](https://github.com/karpishe-experiments/agentic-poc/blob/baa9dda25c041b2d7a77853f9f6c3daa73161217/docs/accepted/2026-09-27_dify-booklet-runner/dify/m5-openai-image-bounded.py):
observed workflow identities, explicit no-retry settings, native ordered references,
hash checks and finite adapter limits. Source callbacks, deployment origins,
provider credentials/models and persona cases are not copied. The story-panel
sample is not an implementation input.

The [candidate generator and adapters](../../../tests/booklet-compat/candidates.ts)
are shared test support for T18–T20. Graph IDs and adapter identities must change
when their incompatible wire contracts change. Native-file objects use an explicit
offline byte carrier; they are not a claim about installed Dify SDK serialization.
The reviewer envelope is provisional until T19 and reuses T01's typed quality record.

| Capability | Offline evidence |
| --- | --- |
| Parent-only application start | Transport allowlist accepts one parent publication; child arguments come from parent graph bindings |
| Private boundary | MCP and Human Input occur only on parent; child strict envelopes reject private fields |
| Structured output | Generated selectors deliver objects to executed Code nodes; string output fails |
| Invocation binding | Operation, invocation, publication, fingerprint and provider-observed child ID mismatches fail |
| Native files | A fully decoded one-pixel PNG; ordered native IDs and SHA-256 checks; absent/null/altered/oversized files fail |
| Reviewer | Original asset, exact target revision and approved sources are bound; contradictory quality findings fail |
| Human Input | Start → pause → native form → response → stream/retrieve same parent; exactly one generation POST |
| Unknown outcomes | Lost start response, incomplete SSE and uncertain human submission surface without automatic replay |
| Bounds | Required adapter fields, timeout ceiling, byte limits, no-retry configuration and finite Code-node step budget |
| Measurements | Deterministic provider/model/request ID, token counts and duration; provider cost remains unknown |

The finite step guard tests budget exhaustion; it does not execute a Dify Loop
node or simulate a Dify scheduler. The fake provider returns fixed results and
does not prove runtime timeout cancellation or perform visual evaluation.

## Verify and remaining acceptance

The affected existing transport and T01 tests run separately:

```powershell
node --conditions=react-server --import tsx --test tests/accounts/dify.test.ts tests/booklet-contracts.test.ts
```

Task validation and status live in the [delivery plan](implementation-plan.md).
T18–T20 must replace candidate publications/adapters with generated production
ones while retaining these checks. T28 must prove actual nested execution,
Human Input in the generated combination, installed plugin/native-file behavior,
engine loop termination, live image quality, usage and costs on the deployed
versions. Source [Real acceptance](https://github.com/karpishe-experiments/agentic-poc/blob/baa9dda25c041b2d7a77853f9f6c3daa73161217/docs/accepted/2026-09-27_dify-booklet-runner/M5-real.md)
was incomplete and does not replace Unitale acceptance.
