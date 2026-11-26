# Unitale deployment setup

Configure deploy/environments/staging.json and production.json with this project's public bindings. External targets are staging and prod; retained production paths and APP_ENV=production stay unchanged.

Run npm run deploy:ops -- doctor staging (or prod). Collect missing credential references through the secure channel. Run scripts/deploy/staging-setup.py with --environment staging or prod to preview the existing setup flow. Review its exact digest before applying. Never copy parent database, Firebase web registration, network allocations or credentials.

For Unitale's first staging installation, follow the ordered [first staging runbook](staging-first-deployment.md).

After reviewed host enrollment, promote main to _staging or _prod. A protected configuration change needs an immutable projected bundle and Infrastructure approval of the exact plan. Use deploy:ops plan, status, check, rollback, backup and restore. Backup and restore return approval plans; restore requires an exact snapshot and destination. Complete disposable recovery acceptance before production activation.

Review deploy/image-retention.proposal.json with Infrastructure after selecting the image repository. It grants no enrollment or cleanup authority. Install image-retention-v1, enroll this project explicitly, and inspect deploy:ops maintenance staging before release. Retention keeps at least three successful releases and fourteen days of activations, plus current/previous and pending recovery; image pulls require 20 GiB free.
