# Unitale local Google popup adoption

## Contract and decisions

Unibase updates enter Unitale through a scoped PR to `main`; active issue branches
then receive `main` through normal merges. The repository preferences and
[template procedure](../../template.md#receive-template-updates) own that route.
The original issue-branch import in PR #14 remains historical evidence. This follow-up
places the shared implementation in `main` without importing Booklet feature work.

The exact upstream revision is `02517797c9ecd1d8e9696cd1b68c9b976f2105db`, recorded by
`template:update` in `project.source.json`. It includes the reviewed popup implementation
from Unibase PR #64 plus docs/guidance closeouts #65/#66. Local real-Firebase uses the
validated hosted Firebase helper and the existing fresh-token/CSRF session exchange.
Emulator/staging/production retain redirects. Only the approved exact local helper
origin is added to `frame-src`; other CSP directives are unchanged.

Project identity, deployment bindings, dependencies and Booklet implementation/model
are unchanged by this main import. No deployment, migration, provider edit, new
setting, paid call or checkpoint 10 implementation is included.

## Prepared local launch

The operator-prepared ignored `.env.local` retains Firebase project `uniwares-base`
and the scoped `unitale_staging` database, with payments/Dify/MCP/persona execution disabled.
Local and staging operation share those Unitale records. Credentials remain outside Git
under `%USERPROFILE%\.config\unitale`; preserve the private bindings.
Automated regressions use disposable fixtures, never that shared database.

Keep the private origin `https://localhost:3100` and approved local CA. From the root:

```powershell
Remove-Item Env:FIREBASE_AUTH_EMULATOR_HOST -ErrorAction SilentlyContinue
node --import tsx scripts/check-env.ts
$certificateDir = Join-Path $env:USERPROFILE '.config/unitale/tls'
node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3100 --experimental-https --experimental-https-key "$certificateDir/localhost-key.pem" --experimental-https-cert "$certificateDir/localhost-signed.pem" --experimental-https-ca "$certificateDir/localhost-ca.pem"
```

Use the direct Next CLI: the generic local wrapper injects emulator defaults.
Plain localhost HTTP popup routing has also been verified with an isolated database;
the prepared HTTPS origin and CA remain preserved. Do not disable TLS validation or
change shared OAuth settings. The approved CA expires December 21, 2026; renewal or
trust changes need explicit operator authorization. The approved Current User CA is
`Unitale localhost development CA`, constrained to localhost/127.0.0.1 and server
authentication, with no subordinate CAs. Its SHA-256 fingerprint is
`AC23B09684DCBC048AF3941C6C20764272E6C36896276823DA55FAE5C2465D75` and Windows
thumbprint is `E0C628354514E48B616273DD41ECC6358C04F565`.

## Verification and acceptance

The user completed real Google popup sign-in on 2026-11-21 and confirmed the Unitale
account; the existing session endpoint returned 200. That acceptance covered the
original issue-branch adoption. The popup runtime files in this main import match
the same reviewed Unibase implementation. Closing/blocking/cancelling and the existing
session/redirect guards retain their previously verified behavior.

Current main-based build and affected verification are recorded with its PR. They
establish this integration separately from earlier feature-branch test results.
After the PR merges, propagate `main` into issue #10, preserving its Booklet work and
updating its import record to the same exact source. Checkpoint 10 remains unimplemented.
