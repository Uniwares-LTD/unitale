# Base application architecture

Local real-Firebase Google sign-in selects the hosted popup helper through the public
`googleSignInMethod` enum. The same validated project-domain policy controls local
`frame-src`; other CSP directives and hosted/emulator redirect behavior are unchanged.
Popup users pass through the existing verified-token/CSRF session exchange. See
[local setup](../README.md#local-google-popup-sign-in).

## Dify environment ownership

Each managed Dify app belongs to the current project and one environment. A journaled
creation/import binds it to its Dify instance/workspace, environment-tagged app and
managed MCP provider. Foreign/unmanaged apps can be copied from exact published versions
but cannot register directly. Registration and live Run admission enforce this boundary;
accepted definitions include the verified binding. Administration shows environment,
verification state and source publication. See [environment binding](mcp.md#environment-owned-dify-apps).

For deployment status and remaining changes, see the [staging transition](deployment.md#deferred-compatibility-and-recovery-work)
and [shared architecture](https://github.com/Uniwares-LTD/infrastructure/blob/main/docs/architecture.md).
Current staging retains worker containers, app Redis and private Nginx.
Shared-service and job-endpoint consolidation remains deferred.

## Current foundation

Base is one Next.js App Router application with Firebase Authentication, MongoDB profiles, a responsive shell, appearance preferences, opt-in diagnostics and PWA support. Account acceptance uses the Auth Emulator and isolated MongoDB. M3 retains a configurable Bubblewrap Android project and manual release workflow; Android compilation and live activation are pending as recorded in the implementation plan. M4 provides standalone container, isolated VPS release/check/rollback tooling and independent advisory workflows. Staging release and worker/readiness checks are verified; see the current deployment record. Production and Android activation remain separate.

`src/app` owns routes, layouts, metadata, loading, and recovery pages. Server Components provide page content by default. `src/components` owns the application shell and interactive appearance/navigation controls; `src/components/ui` contains CLI-generated shadcn primitives. `src/lib/server` owns server-only access, starting with configuration. `src/lib/config` contains pure schemas and the explicitly public configuration type. `src/lib/utils` is the shadcn class-name helper.

Client boundaries cover browser authentication, interactive forms, themes, navigation, diagnostics, payment controls and error recovery. The shell accepts server-rendered children rather than moving all page code into a Client Component. There is no custom API server or client state library. Server reads call server modules directly; web mutations use Server Actions and external HTTP contracts use Route Handlers.

The public display default is Base. `APP_NAME` feeds server-rendered metadata and
the request-time install manifest as well as the shell; image builds do not freeze
an environment's name. Internal cookie, database and deployment identifiers now use fresh `unibase` namespaces; old data and private overrides are untouched; derived projects follow the [identity inventory](../README.md#start-a-derived-project).

## Design system

The vendored stylesheets in `src/styles/design-system/` supply palettes, font
hooks and Tailwind typography roles. `src/styles/tokens.css` retains local effect,
reading-width and touch defaults, and `src/styles/presets/glass.css` supplies
Glass effects and reduced-transparency fallbacks. `src/app/globals.css` loads these
and defines local semantic mappings, page typography, focus and motion/touch rules. `page-patterns.tsx` composes
existing shadcn Alert/Card primitives into headers, notices and empty states used
by account, credits and administrator screens. Navigation remains responsive and
uses the existing shadcn Sheet and DropdownMenu.

`/design-system` is a development-only route with synthetic interaction examples,
a sample wallet and a labelled static creator preview. It returns 404 outside
`next dev`; a path-scoped `src/proxy.ts` guard returns that status before streaming,
with a second guard in the page. It does not add creator models, generation or provider calls. Theme
selection updates browser appearance; sample actions otherwise remain in memory.
The style provider keeps the public appearance cookie and root data-style in sync.
The root validates that cookie before rendering; APP_STYLE is the runtime default.
Profiles may save default/classic/glass/soft-blue independently of light/dark/system. Older
profiles default to the application style, and updates omitting style preserve it.
Glass observes the current page's `og:image` metadata in the browser, loading only
while Glass is active. Successful covers receive a light canvas wash. Local reading scrims and denser
form/table surfaces protect contrast while clear panels show artwork through
blur, highlights and inset edges. Absent, unsafe or failed covers retain the
gradient canvas. No cover is persisted on the account.
See [design-system maintenance and testing](design-system.md).

## Configuration boundary

The server-only reader explicitly selects APP_NAME, APP_STYLE, APP_ENV, and APP_ORIGIN. It returns separate public and server configuration objects. The application name crosses into the shell and the validated default style goes to the appearance provider. The client-safe public schema reads no environment variables and strips unknown properties. Server validation rejects malformed origins, credentials in URLs, path/query/fragment suffixes, and HTTP in staging/production. Error messages identify settings without reflecting supplied values.

The Next.js instrumentation hook checks application, database, authentication and payment configuration at startup. The command-line validator loads Next.js environment files and uses the same pure parsers. `src/lib/config/database.ts` validates MONGODB_URI/MONGODB_DATABASE independently of Firebase; `src/lib/server/database-config.ts` reads only those private settings, and `mongo.ts` reuses the connection pool. Index setup uses the database parser directly; bootstrap and maintenance validate their required database/auth settings separately. Local development defaults to demo Firebase authentication and loopback MongoDB. The authentication form receives only the Firebase browser allowlist (project ID, app ID, public API key, same-origin auth domain, and local emulator URL); database configuration and Admin credentials stay server-only.

## Project extensions

For a derived application's palette, typography and self-hosted fonts, start
with the [design extension guide](design-system-extension.md).

## Extension conventions

### Project extensions

Project features and samples register through two project-owned lists instead of
editing core files. [src/project/extensions.ts](../src/project/extensions.ts) is
client-safe data: a module descriptor (routes, collections, workers, configuration
and dependencies), sidebar/account links and English administration sections.
[src/project/server.ts](../src/project/server.ts) is server-only: MCP tools, domain
adapters and idempotent index setup for an extension module. The contracts live in
`src/lib/extensions.ts` and `src/lib/server/extensions.ts`.

Core composes these after its own entries: module IDs and descriptors (so the
manifest, `moduleForPath`, workers, configuration checks and diagnostics include
them), navigation, administration sections, the MCP catalog, the domain registry
and `db:indexes`. Registration is validated when the registry loads: IDs,
collections and admin links must be unique, dependencies must be core or listed
earlier, module routes must not overlap core or other extension routes, links stay
inside their module's routes, and MCP tool names are unique. A module is enabled
only when its dependencies are. A server extension may attach to a core module ID.
The domain registry composes on first use, so extension code may import Runs or
domain services; import only types from `src/lib/server/mcp/tools.ts`. Contributions follow `moduleEnabled`; adapters of a
disabled module stay registered for accepted attempts but reject new targets.
Routes still live under `src/app`: module routes are gated by the proxy and
`endpoint()`; pages outside module routes, such as administration, check
`moduleEnabled` themselves. Link labels use `ui` catalog keys through a literal
`t("m…")` call so client key inventories find them. Links name a Lucide icon
instead of importing a component, because server scripts load the registry under
the `react-server` condition; the shell loads these icons lazily, so they appear
just after the core icons on first paint. Extension MCP permissions are added to
`mcpPermissions` in the environment catalog so client grants validate.

Samples are removable features declared in [samples.json](../samples.json); see
[the samples guide](../src/samples/README.md). The notes sample is the reference
for a complete extension.

### MCP tools

`/api/mcp` is an opt-in Node Route Handler using the official MCP SDK's stateless
Streamable HTTP transport with JSON responses. Each request authenticates a
private service credential, receives a permission-filtered catalog, and uses an
isolated server/transport. The typed server-only registry calls application
services directly. Public tools return app metadata and synthetic reference data. Optional private
Run/artifact tools additionally verify an encrypted, attempt-scoped capability.
No user identity is inferred from a service token; OAuth and persistent MCP
sessions remain outside this integration. Request/result bounds,
execution cancellation and allowlisted runtime logs apply at the shared boundary.
See [MCP implementation and maintenance](mcp.md) for configuration, lifecycle and
future extension requirements.

Keep one application and extend the current directories:

| Location               | Responsibility                                                        |
| ---------------------- | --------------------------------------------------------------------- |
| `src/app`              | Routes, thin Server Actions/HTTP entrypoints, page composition        |
| `src/components`       | Interactive application UI; reuse `ui` shadcn primitives              |
| `src/lib/contracts`    | Pure validated inputs and explicit output DTOs                        |
| `src/lib/config`       | Pure environment parsers with safe field-only errors                  |
| `src/lib/server`       | Server-only authorization, application services and provider adapters |
| `src/lib/server/store` | Typed MongoDB persistence, indexes and transactions                   |
| `scripts`              | Operator commands and process entrypoints                             |

Feature services derive the actor from current sessions; persistence receives
explicit authorized ownership and transaction context. Keep provider credentials
and responses behind server-only adapters. Do not copy the source project's parallel `db` /
`lib/application` trees, global agent registry or shared-user assumptions. Add
feature subdirectories only when real code needs them, not empty scaffolding.

Persisted changes must preserve profiles, access, wallets, ledger and idempotency
records. Prefer additive indexes/fields and explicit, versioned migrations when
stored data actually changes. Review existing-data compatibility and rollback
before dropping indexes or rewriting records. `db:indexes` is idempotent index
setup; never import the source project's destructive reset.

`npm run db:migrate` applies forward-only data migrations from
`src/lib/server/core-migrations.ts` and server extensions' `migrations`, in that
order. IDs are `<owner>:<NNNN>-<name>`; the owner is `core` or the module that owns
the data, so records stay valid when a module moves between core, samples and
projects. A leased `control` lock serializes runners; applied IDs are recorded in
`migrations` with a source checksum. Migrations must be idempotent: a failure
records nothing and the next run retries. Disabled owners are skipped until
enabled. A changed checksum is reported but never rerun; add a new migration
instead. Take the operational backup first; it is the rollback. Run indexes before
migrations. The lease renews while a migration runs. Provisioning's administration
container has a 15-minute limit, so run long migrations with `npm run db:migrate`
directly. New environments run both during provisioning; existing ones run
`db:migrate` (or `prepare-host.py --apply --migrate`) when upgrade notes say so.
Dify orchestrator Runs extend the shared durable execution engine.
The existing payment worker stays focused on payment reconciliation and credit
maintenance. Quality warnings remain advisory; required behavior must still work.

## Accounts and profile ownership

The browser SDK handles Google redirect and explicit email registration/login. Unverified accounts stay in the temporary verification flow with resend and account switching. After verification, a recent ID token is exchanged for a five-day HttpOnly, SameSite=Lax cookie, Secure with a __Host- name on HTTPS. Browser SDK state is cleared after exchange. Firebase Admin checks session revocation on every protected data access. Protected profile reads and updates require a verified email, and MongoDB selectors always use the session UID.

Firebase persistence is selected during SDK initialization, before redirect processing. A recent tab-scoped Google-attempt marker permits completing a Google user already restored by the SDK when the separate redirect result is empty; unrelated or stale SDK state is never reused. An incomplete redirect displays an explicit error. Local browser emulator URLs use the application's loopback hostname so localhost and 127.0.0.1 do not create different sites for helper storage; the Admin emulator endpoint remains independently configured.

`src/lib/server/profiles.ts` owns profile access through a reused official MongoDB driver pool. `scripts/db-indexes.ts` provisions the unique UID index. Profiles contain only UID, email, display name, color mode, style preference and update timestamp. Strict mutation schemas reject supplied ownership fields. Account edits display name and shows read-only email; Preferences edits color mode and design style. Their separate Server Actions use fresh authorization and an expected-account guard, updating only their own fields so stale tabs cannot overwrite the other section; explicit HTTP clients use `/api/profile`. Server reads call the profile module directly.

Session creation/logout and HTTP profile mutations require the exact configured Origin plus a double-submit CSRF token obtained from `/api/auth/csrf`. The CSRF cookie is HttpOnly and returned as JSON for an explicit request header. Session logout revokes Firebase refresh tokens (and therefore the user's existing sessions), clears the current cookie, broadcasts a non-secret account-change marker, and performs a full document navigation. A shared root session boundary unmounts private state, aborts pending browser API requests and rejects late responses on account changes. It covers AI, history and administrative pages as well as account/credits, and reloads on cross-tab changes and back-forward cache restoration. There is no shared client profile cache that can repopulate an old account after switching.

The fetch helper is same-origin, validates response schemas, carries request cancellation and a timeout, and never retries mutations. API failures expose a stable code, safe message and generated request ID; provider errors and credentials are not returned. The Firebase helper proxy is limited to `/__/auth/` helper filenames on the configured Firebase project host and never forwards application cookies. Its source folder is `%5F%5F` because Next.js treats literal underscore-prefixed folders as private.

## Administrator access

`accountAccess` contains server-owned roles, active/suspended status and a minimum
authentication timestamp. Missing records mean active/member; Firebase claims or
submitted profile fields cannot grant administrative privileges. Session reads and
session exchange both consult current access. Reactivation does not revive cookies
issued from authentication before suspension. Firebase provider settings remain
independent and provider-disabled accounts still cannot authenticate.

The `/admin` routes and `/api/admin/users` call fresh authorization in their server
modules. Administrative Server Actions additionally validate exact origin, current
actor identity and strict inputs. Valid sessions can perform changes throughout
their normal lifetime without a separate 30-minute sign-in age restriction.
Creating a new session cookie from an ID token still requires recent authentication
and token issuance; session cookies last five days. Revocation, suspension,
verification and current administrator permissions remain checked on every request.
User lists are paginated
Firebase reads enriched with MongoDB application profiles; search is exact email or
UID. Account editing changes the application name, not Firebase identity fields.

Admin mutations and audit records share a MongoDB transaction. Change reasons
are optional across administrative forms and contracts; omitted reasons normalize
to an empty string, while supplied notes retain their length bounds. A common control
document serializes permission changes to prevent snapshot-isolation races where
admins remove each other. The actor's current access is checked again inside that
transaction. No browser role cache or old session claim authorizes the mutation.
Session creation verifies the Firebase ID token, recent authentication and account
access before initializing the first administrator. In all environments a verified
`admin@uniwares.co.uk` email (case-insensitive) is eligible while no administrator,
including suspended administrators, exists. The role, audit record and durable
`control/signup-admin-initializer` marker share the serialized access transaction.
The marker prevents repeat appointment after demotion or deletion. The explicit
UID operator command remains available and consumes the same marker. All other
accounts retain member access; no browser-supplied role or email grants access.
Local development and transactional tests use single-node replica sets and retain
the existing development directory. Stripe code is locally verified; live provider
acceptance and Play billing remain separate checkpoints in
[the extension plan](admin-credits-plan.md).

## Stored reports

`/admin` counts application profiles, active administrators, suspended accounts,
stored errors and audit changes from the last day. Profile counts describe users
who have entered the application, not every Firebase identity. `/admin/reports`
and `GET /api/admin/reports` require fresh administrator authorization, including
inside the read transaction. Runtime and audit tables use 25-row keyset pagination
and UTC date filters; their server reads do not call our HTTP endpoint.

Structured server logs are printed to stdout and persisted after the response
through a shared queue of at most two active and 100 pending writes with 500ms
MongoDB operation deadlines. Storage failures are advisory and do not fail the
application action. Only fixed events, timestamps, status, duration, request ID
and derived severity are stored. Runtime records have a 30-day TTL and reports
exclude older records even before a TTL sweep. Admin audit and credit accounting
remain required transactional writes with no TTL. Operator stdout and browser
diagnostics are separate; reports do not ingest arbitrary console output.

## Credit accounting

`src/lib/server/store/credits.ts` owns integer wallets, source/expiry lots,
reservations, append-only ledger entries and permanent idempotency records.
Existing users start at zero. Every mutation locks its wallet, settles due holds
and unreserved expired funds, and commits its projections and ledger together
with snapshot/majority MongoDB transactions. Required admin adjustment audits
share that transaction and the administrator permission fence. Session-driven
wallet mutations also write the user's access record so a racing suspension
forces a retry with current permissions.

Promotional grants default to 90 days, allow an explicit expiry or no expiry;
purchased lots never expire. Allocation consumes earliest-expiring grants first,
then oldest perpetual lots. An ordinary reservation lasts 15 minutes and protects credits
eligible at reservation time even if the source grant expires before commit.
Release and timeout expire any such freed funds. Commit is terminal and cannot
be undone by releasing the hold. Managed AI holds bypass this timeout and retain
funds until verified settlement or audited operator resolution; a review deadline
is not an automatic refund.

Ordinary holds and admin deductions cannot create debt. Purchase reversals reclaim
unused purchase credits first, then other available credits; a shortfall becomes
debt and blocks spending. Holds backed by a reversed lot are cancelled; when other
funds are needed all wallet holds are cancelled first. Restoration restores the
paid entitlement as non-expiring credits, repaying debt first. Billing callers
must supply a verified cumulative reversal target; Stripe provider verification
and money-to-credit rounding live in its server adapter, not the wallet core.

`src/lib/server/credits.ts` derives ownership from the current verified session.
Reserve/commit/release are server-module interfaces for priced features; AI jobs
use managed reservations with atomic job/result persistence,
with no public arbitrary-spending endpoint. Retry keys return the original result;
changing the operation behind a key is rejected. Ledger, lots, reservations and
retry records have no automatic retention expiry. `npm run db:indexes` installs
credit history/expiry indexes and unique purchase references. Paid lot IDs also
derive from the source reference to enforce global ownership at insertion.

The `/credits` Server Component reads an owned wallet snapshot, 25 ledger entries
with sequence-based pagination, the next 10 expiring available lots and up to 25
active holds. `/api/credits` exposes the same allowlisted, uncached read and accepts
only a history cursor; it always derives ownership from the session. Administrators
see the target wallet and a confirmed adjustment form on the user detail screen.
Admin reasons appear in that user's ledger as well as the permanent audit.

`PAYMENTS_MODE` and `CREDIT_PACKS_JSON` are server configuration. Only IDs, labels
and credit quantities cross into the local catalog UI, not provider mappings or
private configuration. Local emulator mode defaults to labelled 100/500/1000
fixture packs; other environments default to disabled payments. Simulation is
rejected outside local emulator mode. Stripe Checkout is implemented and opt-in
with matching provider configuration; live acceptance is pending. Play billing
remains unimplemented, even if a catalog is supplied.

Simulated orders snapshot their server-selected pack quantity and owner. Success,
failure, cancellation and refund state changes commit with credit accounting using
an internal transaction callback. Replays retain the original grant key and never
restore refunded funds. Order lookup is scoped to UID and provider. All screens use the shared session boundary to clear stale content on cross-tab account changes
and back-forward-cache restoration.

## Stripe delivery and maintenance

Stripe Checkout and signed notifications are opt-in C5 code. Orders snapshot
server-selected terms and verified UID ownership. The inbox retains only provider
event/object IDs, with permanent duplicate suppression. A MongoDB-leased worker
retrieves canonical Stripe state under an order fence, verifies checkout/payment
terms and applies idempotent grants/reversals with transactional order projections.
Successful cumulative refunds use exact integer rounding; disputes reverse the
grant and wins restore only entitlement not already refunded. Checkout return
pages do not grant credits. Detected Play contexts have no web checkout fallback.

`scripts/build-worker.mjs` bundles separate payment-maintenance and AI entries. Docker copies
both bundles into the existing non-root runtime image; Compose starts the payment worker
using the same env file and database without a public port or Redis. It retries
notifications, polls overdue orders and settles due credit expiry/holds. Runtime
logging is allowlisted and advisory; financial/order writes remain mandatory.
See [payments](payments.md) for configuration, tests and external acceptance.
The separate `ai-worker` service handles generation and recovery using the same
image and runtime settings. Live Stripe activation and all actual Play billing remain unverified.

## UI and appearance

Sign-in returns saved theme and style in the session response, using an owner-scoped,
one-second MongoDB lookup that tolerates missing, invalid or unavailable preferences.
The browser applies these settings before navigation without a separate profile request.

Use shadcn primitives generated by the pinned CLI and existing components before adding new ones. Application-specific compositions are allowed; parallel primitive libraries are not. Semantic Tailwind/CSS tokens define light and dark appearance. next-themes persists system/light/dark choice under a Base-specific browser storage key and handles initial appearance before hydration.

Interactive theme controls render a stable initial state until mounted. Root hydration suppression is limited to the html element modified by next-themes. Keyboard-visible focus, skip navigation, labelled icon controls, active route state, and modal focus management are part of the shell. Signed-out navigation contains only Home and the header shows a Sign in link (hidden on Account itself). Signed-in desktop and mobile navigation add the enabled Start run, Runs, Files and Saved artifacts routes, and the avatar menu trigger shows the sign-in provider photo (HTTPS only, falling back to an icon) and the profile display name (falling back to the sign-in name or email prefix), the menu shows the signed-in email and it contains Account, Credits, Notifications and Preferences (each only when its module is enabled), plus Administration for verified admins and Sign out. The shell derives its header title from the same route table as the sidebar and menu. Menu visibility is resolved on the server; destination authorization remains enforced independently. Protected pages send signed-out or unverified visitors to `/account?next=<path>`; after sign-in the browser resumes only a validated same-origin page path (`src/lib/return-path.ts`). Admin navigation is a client strip that marks the current section with `aria-current`, scrolls horizontally on small screens and includes a Design system link only in development, matching the showcase's development-only route.

Account holds identity only (display name and email). Preferences holds every setting: language and time zone, appearance, notification categories and browser diagnostics. Signed-out language choices apply through the locale cookie; signed-in language and time-zone changes apply immediately and are saved to the profile in the same action, so there is no separate save step. Appearance keeps an explicit save because the account value follows the user to every device: sign-in copies the saved theme and style into the browser once, and Preferences then shows and saves the browser's current look without overriding it. Destructive or paid actions (artifact and file deletion, Run cancel/restart, AI result acceptance/release, payment reconciliation, credit adjustments and role/status changes) ask for confirmation in an `AlertDialog` that states what will change.

## Validation and failure behavior

Configuration tests exercise missing/invalid inputs, non-local origin requirements, public allowlisting, and non-disclosure in error messages. UI acceptance uses a real browser at desktop and mobile widths, including theme reload/system changes, account/menu navigation, focus, not-found recovery, and console/hydration checks.

Error boundaries show a safe message and retry/home recovery, emitting only a fixed event type to diagnostics if enabled. They never expose caught messages or stacks. API/action catch blocks preserve Next.js control-flow exceptions with `unstable_rethrow`; observation listeners do not suppress browser/framework handling.

Use the installed Next.js `retry` error-boundary callback for recovery: it refreshes server content and clears the error. `reset` alone only clears client boundary state and can rethrow the same failed server response. Recovery was verified in a production server using a temporary failing Server Component, removing the failure, and clicking Try again without reloading the page.

Quality checks are advisory, with individual outcomes retained. Build compilation/bundling and later runtime-readiness failures remain blocking. Imported skill workflow defaults cannot change this policy.

M4 deployment work uses `output: standalone`, with public/static assets copied into
a multi-stage non-root container. Runtime Firebase browser values still come from
the existing explicit server allowlist; no credentials are supplied at build time.
Liveness and readiness have separate uncached routes. Readiness validates mounted
Firebase credential availability and bounds the MongoDB ping. Deployment tooling
and live acceptance are described in [VPS deployment](deployment.md).

## Diagnostics, offline behavior and Android

The opt-in [diagnostics API](diagnostics-api.md) is separate from browser diagnostics. Administrators issue expiring, capability-scoped grants from Application settings. Grants are generated server-side and copied once with their configured endpoint. MongoDB stores project/environment-scoped verifiers durably; Redis holds only rate-limit counters. Grants survive releases and Redis recreation, expire within the selected duration (up to 30 days), and are verified with scrypt, the issuer's Firebase status and the issuer's access revision. A grant permits read-only diagnostics across accounts, through dedicated projection readers that never seed, settle or create records. Each access writes a sanitized 30-day record before data is returned. The endpoint is disabled in production.

`src/lib/diagnostics.ts` constructs records from an explicit allowlist: fixed event type, generated timestamp, bounded HTTP status, elapsed time and UUID request ID. Unknown/free-text fields never enter records. Server-only logging emits JSON with severity for API/helper completions and profile actions. Next.js `onRequestError` emits a safe event independently; it omits timing rather than inventing a request duration. No raw error, request URL, headers, body or identity is forwarded. Framework development output remains separate.

Browser diagnostics default off in every document, retain at most 100 events in memory, and clear on disable/reload. The diagnostics panel on Preferences uses existing shadcn controls. Error listeners and the API helper record only sanitized metadata; there is no console interception, durable buffer, diagnostics upload or debug-header response mode.

The request-time manifest uses the allowlisted runtime application name. The SVG, PNG install icons and generated favicon describe the shared app. `public/sw.js` caches only the standalone public HTML fallback. Full document navigation uses the network and falls back on network failure, without writing fetched responses. API/auth-helper requests, RSC payloads, mutations and subresources are not intercepted. There is no offline account cache, mutation replay or automatic form-discarding refresh. Worker upgrades follow the browser's normal lifecycle.

`ANDROID_HOST` and `ANDROID_PACKAGE_NAME` supply wrapper identity through `.env.local` or process environment; `android/config.json` owns only the version. The pinned Bubblewrap generator writes the untracked `android/project`, using local icons without a live deployment. Generated sources embed the selected identity and must be regenerated when settings change. CI supplies the same names from the tracked production environment document. Signing comes from environment variables outside the generated project. The manual Android workflow is independent of web deployment and Play publishing is explicitly opt-in. Digital Asset Links uses the server runtime package/certificate settings; the private signing key is never part of the website. See [Android delivery](android.md) and [M3 testing](m3-testing.md) for setup, boundaries and pending external verification.

## Orchestrator Runs

`/runs/new`, `/runs` and `/runs/[id]` replace task/chat and creation-workspace UI.
Dify 1.17.1 Workflow apps own their instructions, Agent nodes and child tools.
Unibase owns authentication, credit admission, durable history and registered UI.
The existing `aiJobs` engine stores immutable `RunAttempt` snapshots, application
logical Run IDs, linked predecessors and provider run/task IDs. `runEvents`,
`runDecisions`, `runResults` and `runAssets` hold normalized progress, server-only
form tokens/intent, safe outputs and private bytes/references. Queries always use
the verified session UID. Server pages read services directly; clients poll
uncached owned HTTP snapshots.

Run detail keeps read failures separate from command failures. Successful manual
refresh or polling clears a recovered read warning; it does not dismiss a failed
approval, upload or command. Retrying an action clears its previous error before
reporting the new outcome. The saved-artifact template's decline paths return a
partial `draft_result` without images; only its approval tool reaches the success
output, preserving success-only settlement.

Dispatch intent precedes the generation POST. Unknown acceptance cannot dispatch
again. The worker fences stale leases, retrieves saved provider identity and
reconnects by workflow-run ID with matching end-user identity and state snapshots.
Node events deduplicate on execution ID/status; forms deduplicate on node/token.
A decision intent is saved under fresh access checks before its one-shot provider
submission. Dropped responses remain uncertain until provider evidence confirms
them; browser retries do not blindly resubmit. Parent Human Input mediates child
questions because workflow tools cannot pause in this Dify version. Child calls
appear as parent stages without promising their complete internal tracing.

Structured result outcomes distinguish technical success from business success,
failure and partial completion. Generated cards use the shared Runs registry and
shadcn components; executable HTML/React and unknown versions are rejected.
Images contain bounded validated bytes and UUID references that the server remaps
to owned asset IDs. Model-selected URLs are never fetched. Image normalization,
Mongo/private S3 storage and exact-object deletion remain server-only.

Each normalized PNG also gets WebP display variants stored inline with the asset:
`thumb` (400 px) and `preview` (1280 px), never enlarged and omitted when not
smaller than the original. `/api/run-assets/<id>?size=thumb|preview|original`
checks session and ownership once per request, reads variants without loading
the original payload, and verifies digests before sending. Assets saved earlier
get variants on first request or through the `runs:0002-asset-variants`
migration; unprocessable images keep serving the original, and lazy generation
runs at most two at a time per process. Deleting a saved asset removes its
variants with its payload. Responses are `private, max-age=300` with the digest
as ETag: repeat views within five minutes stay local, later views revalidate
with a session and ownership check that reads only digests and answers `304`.
Lists use thumbnails, Run results use previews that open the original.

`/admin/settings` stores typed `baseSettings`, revisions and audited updates.
Environment values seed once; public pages use bootstrap appearance until
initialization. Database-dependent actions fail when settings cannot be read.
Workers read current settings between cycles; accepted attempts freeze pricing,
limits and reconciliation policy. Credit packs and expiry policy feed the existing
credit/purchase ledger. Management/encryption secrets, connections, deployment origin and Android
identity remain private environment configuration; absolute safety ceilings,
protocol versions and component registrations remain in code.

`/admin/orchestrators` offers a **Create orchestrator** template dropdown and
version selection for Register/Re-register/Enable of an existing Workflow. `registration.ts` reads the
publication, acquires an encrypted key, verifies API inputs and enables a derived
definition. `dify-capabilities.ts` checks supported Start controls, Human Input
WebApp delivery/form contracts and referenced MCP authorization/tool metadata.
`orchestrator-lifecycle.ts` reconciles complete provider catalogs, verifies app
existence before admission and handles audited Disable/Unregister operations.
Missing workflows are unavailable; incomplete reads and provider errors are not
deletion evidence. A catalog cannot invalidate registrations newer than its read.
Lifecycle changes fence pending registration and increment the configuration
revision. Admission conditionally writes the current orchestrator inside the
credit/job transaction, preventing a concurrent disable from slipping through.
Unregister leaves a private tombstone to prevent seed resurrection. Accepted job
snapshots, encrypted credentials, saved results and tracing remain untouched.
Saved-draft registration validates the draft, publishes when new or changed and checks
the resulting publication. Explicit-version registration validates a published graph
from the selected app's bounded history page without publishing the draft. Its
inputs come from that version, rather than the latest-only `/parameters` response.
Version membership and graph identity are rechecked before enabling; failed or
stale selections preserve the prior definition. Registration performs no draft mutation, injected inputs or provider
response wrapping. Obsolete input/graph setup, validation and manual-save modules/routes
were removed. Registration/audit records retain sanitized progress, not graphs.
The shared management contract accepts only an app UUID and optional version
UUID/page. `workflow-versions.ts` excludes draft rows and exposes allowlisted
publication metadata; graphs, variable values and provider account data stay on
the server. Admin-selected versions affect future admissions. Accepted Run
configuration and execution bindings remain pinned and are never rewritten.

The app contract normalizes native End outputs on the Unibase server, retaining
explicit valid structured business outcomes/cards/images. Invalid claimed rich
results fail validation. Structured envelopes use `result`, with `draft_result`
accepted as a sole output for exclusive unapproved branches so End output names
remain globally unique in Dify. Local owned Run/attempt IDs map to Dify's returned
`workflow_run_id` and active `task_id`; declared legacy fields remain compatible.
Zero-control workflows send empty inputs. Human Input uses provider form tokens,
matching end users and event reconnect; Generative UI is validated data, never
executable model code. Saved node events form the owned tracing timeline.

MCP provider checks do not invoke remote tools or prove network reachability.
Connected providers may expose read/write operations under their own permission
and ownership rules. The built-in catalog includes bounded artifact saves under explicit permissions
and verified Run capabilities; service tokens never imply user ownership. Registration performs no generation or MCP side-effect probe.

Create selects an allowlisted JSON DSL from `src/lib/server/runs/templates` through
a shadcn dropdown. Server Components pass only template metadata to the client;
graphs and provider configuration stay server-only. The example templates
are Document summary (basic MCP/human input), Saved artifact (owned draft, approval
and retained media), and Unitale (real comic generation, grouped reviews and
retained provider images), plus Case preparation (multimodal evidence, fact review and supplied-law
retrieval). Unitale retains the `story-panel` ID. Case preparation imports a private
draft with `setup-required` status; destination-specific country, Knowledge base
and multimodal models are configured in Dify before publication/registration. Its
brief uses the existing artifact adapter and human-only revision approval. No new
case domain or knowledgebase service is added. Each creation journal
binds its template ID; browser retry keys are separate per template. Existing
template-less journals map to Document summary. A template switch cannot reuse
the same import intent. Create imports its graph, checks that its draft is unchanged,
publishes it and invokes the same registration service. `orchestratorCreations`
journals the client idempotency key, irreversible import intent and confirmed app
ID with a fenced lease. Unknown imports are not repeated. This path is separate
from general registration. New starters disable the public Dify site while retaining
API access and Human Input WebApp delivery. Create merges its confirmed app into
the client list and refreshes discovery. The starter uses zero inputs, an authorized reference MCP
tool, a Human Input Generative UI choice and prompted LLM/End native text output. MCP
structured content is consumed from `json`, because Dify may leave `text` empty.
Reconnect consumes events following historical pauses. Polling uses confirmed
terminal retrieval directly, replaying only when a non-stopped Run still has an
uncertain decision submission. Historical replay cannot downgrade that terminal
outcome. When terminal snapshots omit historical nodes, the
worker reads bounded Console node metadata for its accepted app/Run and saves only
titles, statuses and timings. Raw inputs/outputs are discarded. Trace transport
failure does not invalidate verified termination or charge the Run twice.
An accepted execution's transport timeout schedules the next retrieval at its
saved polling interval, rather than exponential backoff that could outlast a
generated file's signed download URL. Provider-specified retry delays retain
priority. Already staged owned image bytes remain reusable after provider links
expire; an unstaged expired link still needs provider-authorized renewal.

App keys use AES-256-GCM in `difyCredentials`; `difyCredentialAcquisitions` serializes
reuse/creation and retains uncertain create intent. Web/workers resolve only private
credentials. Encryption uses a dedicated secret or HKDF from the management key,
scoped to instance/workspace/app. Deterministic registration IDs prevent duplicate
orchestrators, unchanged re-registration retains revisions, and accepted attempts
keep their previous immutable configuration and credential reference. Legacy
execution references and history remain readable without reintroducing manual UI.

Existing credit reservations reserve the disclosed maximum once. Default fixed
charges apply only on business success. Verified-usage failure billing excludes
fixed/hybrid base charges and requires trustworthy summary usage. Missing usage
requires administrator reconciliation. Reconnection and decisions incur no new
reservation. Explicit recovery creates a new attempt with current terms and a
compatible checkpoint version. Otherwise restart uses latest enabled configuration.
Uncertain attempts need reconciliation or an audited administrator resolution.
Administrator diagnostic stages require a declared entry point and use new owned
executions, not arbitrary node replay.

`/admin/ai` retains usage and execution resolution. Preview-confirm cleanup removes
old terminal attempt content while retaining ownership/financial/audit/retry
identity. It excludes active or uncertain jobs and skips changed preview targets.
Private S3 removals use durable fenced intents on the existing maintenance worker.
No local database is automatically deleted.

## Runtime packaging

Next.js bundling and output tracing explicitly use the application's own
directory. A derived checkout nested beneath another lockfile therefore retains
the expected `.next/standalone/server.js` layout. Local document CSP permits only
the configured loopback Auth Emulator port, with no emulator origins in live
environments.

One Next.js standalone web application and the existing AI/maintenance workers are
bundled. `sharp` stays external for image normalization. DSL templates are traced
into the standalone app and copied by the local standalone runner. PDF/ZIP
renderers, fonts, export jobs and dependencies are removed. Container smoke checks
verify all worker entries, image normalization, excluded development dependencies
and health boundaries. Tests use disposable MongoDB and Firebase Auth emulator;
live provider, VPS and Android acceptance remain external checkpoints.

## Personas and product persistence

Administrator-owned, revisioned `personas` contain role instructions, pricing and
call limits. The Persona administration page also owns one revisioned shared
completion configuration and common instruction template. Model, optional
temperature, token limit/parameter and shared instructions are administrator-only
settings; `PERSONA_COMPLETION_MODE`, `PERSONA_COMPLETION_BASE_URL` and
`PERSONA_COMPLETION_API_KEY` remain server configuration. There is no Persona
workflow, Orchestrator purpose classification, or responder registration.

Start choices and admission bind the Persona revision, shared settings revision and
connection fingerprint. Transaction fences reject stale choices. Accepted attempts
snapshot their complete configuration without credentials. Later settings changes
apply to future Runs. The existing AI worker schedules one zero-reservation child
completion per decision; it sends separate system messages for common/role
instructions and public question/history as user data. Raw answer text follows the
existing decision-submission path. Human-only approvals and takeover fences remain
authoritative. File questions and unsupported legacy response modes fall back to a
user. No legacy Persona workflow execution adapter or data migration is retained.

The server-only adapter uses non-streaming Chat Completions with a 60-second
request deadline and 1 MiB response limit. Empty, truncated, tool-call and malformed
answers cannot be submitted. Identity, terminal output and usage are persisted
atomically before settlement/submission. Uncertain dispatch is never retried as a
new POST and remains reviewable; human fallback emits the existing notification.
Portable provider retrieval/cancellation is unavailable, so takeover prevents late
submission while already-dispatched work still needs termination evidence.

Admission reserves the parent maximum plus the configured maximum responder
calls. Successful valid responder results have separately calculated charges,
including after takeover or parent failure. Child fee attribution is persisted
in the parent settlement transaction; Run detail and administrator usage expose
the breakdown without a second wallet charge. Combined settlement waits for every
child's confirmed termination and required usage. Missing child price evidence
remains reviewable and can receive an audited waiver. Parent pricing/failure rules
are retained. Completion provider usage appears under `persona-completion` in the
existing administrative usage report.

Private MCP tools consume `context` only through direct Start-to-tool
argument bindings checked during registration. `runCapabilities` stores a token
hash plus AES-GCM encrypted recovery, attempt/owner/client/operation scope and the
accepted review deadline. Services verify account access and mutate under the
wallet/access transaction boundary. Dify's execution input/tool logs are private;
capabilities never enter LLM prompts or browser DTOs. `productOperations` journals
payload-hashed idempotent writes; approval binds a persisted decision to an exact
artifact revision and records its human/persona source.
Registration hides `context` only for private-MCP graphs; ordinary public
workflow context remains public. Registrations snapshot the private input name as
`contextInputName`. Legacy publications can still bind `unibase_context`, and older
snapshots without a name default to that legacy spelling. Injection and public
input filtering share the snapshot's name; no live graph or accepted attempt is
rewritten by a template edit.

The sample `artifacts` and immutable `artifactRevisions` demonstrate domain
persistence through shared services. `resultApplications` journals the versioned
artifact handler independently of generation/billing and retries with a fenced
lease. Downstream code supplies typed result handlers and validates its own owned
association; there is no arbitrary model-driven collection access.

Artifact detail keeps the page and content server-rendered and composes a shadcn
accordion for expansion. Revisions are newest first, with the latest open by
default. Images are grouped by the retained product asset's source attempt and
shown inside that attempt's final saved revision; owner, artifact reference and
ready-state checks filter metadata. This association survives Run cleanup and
uses existing records without a schema migration.

Dify execution failures are classified into bounded, fixed diagnostic summaries
before persistence. Raw provider errors, dependency URLs, prompts and credentials
do not reach Run history or browser DTOs. Terminal executions retain their safe
summary through settlement; historical failures without saved details show an
explicit fallback. Terminal Runs without stage events report that no stage details
were recorded. They do not keep displaying a waiting message.

Personas use fixed, token or token-based hybrid pricing. Provider-cost pricing is
not offered because portable completion responses do not supply verified monetary
cost. Missing required usage remains reviewable; fixed pricing needs no tokens.

The raw path sends the rendered question and public context to the persona, then
forwards the answer unchanged to the workflow. Human UI values are not normalized.
JSON values are serialized once for Dify's paragraph input; strings stay exact.
Original response values are retained separately from provider input strings and
participate in retry hashes. The consuming workflow node interprets the response.
Renderable component definitions and tool execution still have checked contracts.
The Unitale template implements a real J01-J13 comic workflow with four LLM steps
and bounded Python validation/packaging. Native structured-output objects cross
each model/Code boundary. Two ordinary-language review decisions
accept User or Persona feedback. Model steps interpret both natural text and form
answers. A final exact saved-package approval requires a human; raw Continue never
supplies that approval. Nine image-tool calls generate style samples, character
and location references, a cover and three pages after approval. The official
`gpt_image_2_generate` tool uses `gpt-image-2.5-flare`. Each call is followed by a
validator that stops on a missing or invalid image before another paid call;
fixed error markers expose safe model, credential, quota and provider diagnoses.
Existing native
file promotion retains the images as owned Run/product assets. Shared text
descriptions guide visual consistency; generated reference images are not yet
fed back into the page generator. The `story-panel` ID remains stable
for creation-journal compatibility, and existing publications/accepted Runs are
not rewritten. This sample adds no comic domain service or replacement accounting.

Native Dify tool images opt in through the `unibase_images` End output alongside a
successful structured result. Server-only ingestion accepts signed, matching-UUID
image file paths on the configured Dify origin, bounds the download without
service credentials or redirects, and reuses existing private normalization,
staging and product promotion. Reconciliation reuses staged owned bytes after
provider links expire. If an unstaged Unitale image returns HTTP 403, the worker
verifies its identity against the original successful Dify Run and verifies the
bundled file-validator contract in both that Run and the current draft. It runs
only that Code validator with the existing file reference to renew the signed
URL, then repeats the same bounded download and normalization. It does not invoke
the image tool or rewrite/publish a workflow. Changed or missing validators require
review. Retention progress renews the worker's still-owned lease before each image;
settlement failures show reconciliation and preserve terminal evidence and credit
holds. Browser results never include provider download links.

`productAssets` promotes validated Run images and tracks domain references,
reusing the existing MongoDB bytes or private S3 object. Promotion, reference
removal and cleanup share transactional lifecycle checks. Run cleanup preserves
referenced objects and defers content cleanup while product application is pending
or failed. The last product reference permits exact-object deletion after Run
history releases its own reference. The existing maintenance worker handles S3
removal retries; private asset reads continue checking the current owner session.

Artifact publication stages payload copies with a bounded server-side MongoDB
`$merge` before its short publish transaction. Existing product payloads and
references are never overwritten. The transaction reads only image metadata,
rechecks the accepted target and ready source assets, and atomically attaches all
expected images. Copies without product references are private; pending/failed
application records protect their source from history cleanup. Safe application
failure codes and phases are available through diagnostics without exception text.

The Start Run Server Component loads all ordinary workflow choices and owned
artifact summaries, passing only ID, title and revision to the setup form. The
client conditionally creates or selects an artifact, snapshots the complete Run
request before submission and reuses its IDs after uncertain responses. Existing
artifact and Run admission services retain ownership and idempotency authority.
Saved artifacts links to Start Run for creation; its detail controls only delete
existing artifacts.

### Reuse hardening boundaries

Application and host runtime names share a machine-readable catalog under
`scripts/deploy`, included in host-operation bundles. MCP grants remain explicit
and server-only. Caller input parsing uses safe application errors independently
of persisted/provider response validation.

Uploads verify a session before acquiring a body reader, then enforce the saved
file limit plus multipart overhead and an absolute deadline. Service ownership
checks still run before provider operations.

Artifact pages use stable creation-time/ID cursors; revisions use revision cursors.
Revision images are associated with the source attempt's globally final revision.
Run history and actionable decisions have independent 25-row cursor pages.
Cursors are validated against owner/resource/filter, and every database query
continues to enforce ownership.

### Shared request protection and project configuration

The reviewed project manifest is build-time public configuration; it contains no
credentials. Credentials remain private. Public connection settings live in tracked environment documents; derived projects clear installation links unless an explicit shared profile is selected.
Server module guards remain independent of navigation.

Protected Route Handlers authenticate and apply one account-scoped Redis counter
before entering their service. MCP authenticates its client before applying a
separate counter. Actions apply the mutation policy after their actor/origin check.
Counters use a single atomic Lua increment/expiry operation, hashed actor IDs,
project/environment scopes and a 60-second lifetime. Redis readiness participates
in the existing readiness probe.

Nginx strips incoming forwarded addresses, trusts CF-Connecting-IP only on the
Docker bridge host gateway, and preserves streaming. The existing host connector targets a loopback Nginx listener; no app-owned tunnel container exists. Redis has no published host port.

### Owned domains and managed files

Domain adapters provide stable ID/version, reference kind, bounded owned picker
metadata, ownership/admission checks, approval validation and transactional result
application. Pickers return `{ rows: [{ id, title }], next }` for the authenticated
owner and accept `search`/`cursor`. Browser targets contain only kind and ID.
The registered orchestrator selects executable behavior. Adapter admission must
write a domain fence in the same transaction as reservation to serialize deletion.
The generic fenced result worker checks the accepted target snapshot before
application. Artifact-specific behavior lives behind the version-1 adapter;
compatibility exports retain existing imports and persisted artifact associations.

Private-file reservations share the account wallet transaction fence with legacy
provider uploads, preventing concurrent quota over-admission. Durable staging
records precede GridFS/S3 writes. Ready records retain digest, byte count and owned
references; deleted tombstones preserve retry identity. A fenced maintenance
consumer reclaims abandoned stages after 24 hours and releases quota only after
storage removal. Run admission and file-bearing decisions acquire references in
their state transaction. Terminal-history cleanup releases them. Provider upload
references retain binding snapshots and add `managedFileId`; legacy references
remain readable without pretending source bytes are available.

### In-app notifications

Run decisions requiring a human, terminal parent Runs, confirmed credit purchases
and reversals, and administrative access changes write notification intents inside
their originating MongoDB transaction. Persona fallback writes its intent together
with the fallback decision state; child executions never create final Run notices.
The maintenance worker uses expiring fenced leases and one transaction to evaluate
category preferences, insert the unique inbox row and acknowledge the intent.
Preferences share a write fence with materialization. All three categories default
on. Only allowlisted template keys and bounded parameters are persisted.

Inbox queries are owned, keyset-paginated and exclude records at 90 days; TTL and
bounded worker cleanup remove expired data. The outbox retains only a hashed
completed-event tombstone after retention to prevent duplicate replay. Opening a
Run notification rechecks ownership and retained history before resolving its
allowlisted internal destination. Visible tabs poll unread summaries every 30
seconds through one shell-level provider shared by the header badge and the inbox,
and abort requests on hide, unmount and session invalidation. Category preferences
are edited on Preferences; the inbox links there.

## Locale and direction

English and Arabic retain identical page/API URLs. `requestLocale` resolves the
project-namespaced browser cookie, stored account locale, weighted Accept-Language,
then the project default. Missing account timezone defaults to UTC; supported IANA
timezones are validated with Intl. The localization mutation updates only locale
and timezone, independently of appearance and profile edits.

The root renders lang/dir and Radix direction. The administration area is always
English and LTR, including shared shell controls, form validation and admin API/action
messages. Administrative copy lives directly in its source components; dynamic
state/field labels live in `src/lib/admin-labels.ts`, outside translation catalogs.
Public pages retain typed next-intl catalogs, generated per-page client key inventories
and a persistent shell catalog. Each page carries a provider on client navigation.
The root provider switches presentation at the admin boundary without changing
the saved language, timezone or offline language preference. Run/provider text,
user-authored labels and identifiers retain their original content. Dates use the
resolved timezone except administrative date filters/reports, which retain UTC.
Notification templates resolve at read time; API error codes remain stable.

Public offline recovery caches only its HTML and language script; the selected
locale is a namespaced browser preference. It never caches account data. Regenerate
public recovery assets and client key inventories with `node scripts/i18n-assets.mjs`
and `node scripts/i18n-client-sections.mjs`; `npm run check:i18n` checks drift.

## Project creation and compatibility

`project.config.json` is the validated public setup manifest: slug/display/style,
module selection, locales, example selection and optional Android package identity.
Runtime environments retain credentials and connection settings. Module descriptors
select navigation/admission, index ownership and worker requirements; accepted
financial and Run history is preserved independently of new admission visibility.

The initializer copies the objects reachable from a reviewed commit into a new
repository, checks it out on `main`, deletes generated and source-owned files
(caches, build output, generated Android, editor settings, tracking selections),
applies the identity rewrites and records everything in one initialization commit
with an `upstream` remote. It rejects symlinks/submodules, case-colliding paths,
unsafe destinations, missing source contracts and any revision whose history ever
touched private paths (`.env` files, credential or service-account JSON, keys,
`secrets/`, an `.npmrc` with auth). `project.source.json` records the source
revision, the `template.json` version, the upstream remote name and removed
samples.

`npm run template:update -- <version>` fetches `upstream`, merges the
`template-v<version>` tag with a merge commit and prints the upgrade notes between
the recorded and the new version. It keeps files the project deliberately deleted
when the template changed them, resolves `samples.json` and registry conflicts
caused by removed samples, then reapplies those removals from the release's
declarations. Other conflicts stop with the merge open for manual resolution. The
files the initializer rewrites (package identity, environment examples, deployment
examples, workflow names, the Dockerfile and offline assets) are the expected manual
conflict points. Revisions without `template.json` predate template
versioning and are rejected. [CHANGELOG.md](../CHANGELOG.md) defines release
semantics and upgrade notes; `npm run check:template` reports drift.
Package identity, local connections and deployment examples derive from the manifest.
Application mode enables reusable modules with providers inactive and examples
hidden. Example mode must be explicitly selected. Local fixture verification uses
private synthetic commits and leaves working-repository refs/index/history alone.

Legacy protocol fields such as `unibase_context`, cryptographic derivation labels,
accepted handler versions and permanent accounting records remain compatibility
contracts. New private workflows use `context` with a snapshotted input name;
legacy reads/dispatch remain supported. These are not browser/deployment namespaces
and must not be blindly renamed.
The fresh namespace installation does not migrate or reconnect legacy payment
provider records; keep old deployments/databases isolated during an explicit handoff.
See [reusable services](services.md) for quotas, references, limits and transactions.

## Intermediary HTML integrity

Document responses use private/no-store cache directives plus `no-transform`.
Cloudflare's email obfuscation otherwise rewrites server-rendered email text and
injects a decoder without the page nonce, producing CSP violations and hydration
mismatches. Keep the strict document CSP and prevent edge rewriting rather than
allowing an injected decoder or suppressing hydration errors. The proxy matcher
excludes immutable Next.js assets and API paths. See [deployment acceptance](deployment.md#phase-3--verify-and-hand-off)
for current live verification; adding the source header alone is not deployment.

## Provisioning ownership

Tracked environment JSON owns public application/deployment configuration.
Local command wrappers load these defaults after private Next.js env files.
Provisioning renders runtime settings by merging selected tracked values with
private host credentials. Release snapshots that configuration and merges tracked
runtime settings; rollback retains the previous snapshot without reading new config.
Image-owned application flags are projected separately from the tracked environment
documents. Initially only `DIAGNOSTICS_ENABLED` is included in the image's
`runtime-settings.json`. A Node preload applies the selected `APP_ENV` map before
web/worker startup, overriding retained values only for that flag. The existing v1
deployment request validates the host profile, excluding this image-owned field.
All infrastructure/provider settings remain bound to the installed hash. Ordinary
flag changes use image releases; rollback restores the previous image's flag map.

Staging provisioning uses Infrastructure's reviewed root-owned installer and
`prepare-host.py`, existing shared Firebase credentials, an app-scoped Atlas user
and an owner-managed route. Routine release/check/rollback uses the installed
restricted dispatcher over direct pinned SSH, repository secrets and public GHCR.
It cannot change provider bindings or upload replacement host control code.
Maintenance and AI workers share the web release image and retain separate health probes.

Staging and production now share the restricted, public-image v2 release path.
Initial provider/host setup uses the guided setup helper and reviewed Infrastructure
installation. The legacy Provision environment and host-directory Actions entrypoints
return OWNER_ACTION_REQUIRED; they do not upload privileged scripts or expose admin
credentials. Protected changes use immutable plans and Infrastructure OIDC approval.
See [deployment guidance](deployment.md#repeatable-release-and-protected-change-path)
for exact interfaces, rollout ordering and production acceptance.

Staging shares Firebase identities with explicit web registrations and app-specific
MongoDB data/roles; production requires a separate Firebase project per app. Atlas
capacity is externally owned. agentic-poc owns the existing tunnel/SSH Access/Dify
and its Terraform writes the complete route list. The application verifies its owner-managed
route; it does not install a route controller or use Booklet's deployment workflow.
The [ownership follow-ups](deployment.md#shared-ownership-follow-ups) require an
explicit migration before authority changes.

## Operational documentation ownership

Application deployment guides own current release identities and acceptance. Infrastructure inventory owns installed host/configuration identities and dated capacity; its operations guide owns installation, privileged updates and recovery. Shared gateway/Redis/worker consolidation remains deferred. Documentation does not transfer Booklet, Dify or tunnel ownership.
