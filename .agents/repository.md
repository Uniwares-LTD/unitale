# Repository preferences

## Work tracking

- Issue language: English

## Branches

- Integration branch: main
- Deployment branches: none

Confirmed by the repository owner on 2026-11-15. Tracking uses the Uniwares
organization project #2; see [tracking.json](tracking.json).

Unitale has no deployment branches yet. The `_staging`/`_prod` release workflows and
[deployment guidance](../docs/deployment.md) came over from the Unibase template; do
not promote to those branches until the owner records them here. The `upstream`
remote is Unibase and is used only for template updates: never push or open pull
requests there. Preserve existing work branches; see the [adapter](repository-adapter.md).

## Template imports

Import reviewed Unibase revisions on a clean branch from current `origin/main` and
merge the scoped adoption PR into Unitale `main` first. Then merge `main` normally
into active issue branches, including `feature/10-dify-workflow-design`. Preserve
existing feature history and keep its implementation out of the import PR.
A different route requires explicit user approval; the current checkout does not
select the import destination. See [the template procedure](../docs/template.md#receive-template-updates).
