const modelChecks = [
  "typecheck",
  "check:docs",
  "test",
  "test:booklet-repositories",
  "test:booklet-lifecycle-media",
  "test:booklet-application",
  "test:booklet-mcp",
  "test:booklet-foundation",
  "test:booklet-modules",
  "test:booklet-compat",
];

export default function projectChecks(path) {
  if (path === "src/project/theme.css") return ["manual:composer-keyboard"];
  if (
    /^src\/project\/(?:components\/conversation\/|booklets\/conversation\/|booklets\/.*\.tsx$)/.test(
      path,
    )
  )
    return ["typecheck", "check:i18n", "manual:ui", "manual:composer-keyboard"];
  if (
    /^docs\/features\/booklet-generation\/workflow-package\/|^tests\/booklet-compat\//.test(
      path,
    )
  )
    return ["test:booklet-compat", "check:docs"];
  if (
    /^(?:src\/project\/booklets\/|src\/lib\/server\/booklets\/|src\/app\/api\/(?:admin\/)?booklets\/|scripts\/booklet-model)/.test(
      path,
    )
  )
    return modelChecks;
  if (/^docs\/features\/booklet-generation\/model/.test(path))
    return ["check:docs"];
  if (
    /^src\/lib\/(?:auth-policy|server\/(?:credit-config|credits|session))\.ts$/.test(
      path,
    )
  )
    return ["test:booklet-modules"];
  if (/^tests\/booklet-modules\//.test(path))
    return ["typecheck", "test:booklet-modules"];
  return [];
}
