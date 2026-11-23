#!/usr/bin/env bash
# One tested release sequence. Advisory reports never determine release eligibility.
set -Eeuo pipefail
set +x
target=${1:?target required}
[[ "$target" != prod ]] || target=production
export TARGET=$target
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
digest=''
image=''
outcome=failed
compatibility=not_attempted
build=not_attempted
publication=not_attempted
deployment=not_attempted
readiness=not_attempted
maintenance=not_reported
report() {
  local safe_target=unknown safe_commit=unknown safe_image=unavailable
  case "$target" in staging|production) safe_target=$target ;; esac
  [[ ${GITHUB_SHA:-} =~ ^[a-f0-9]{40}$ ]] && safe_commit=$GITHUB_SHA
  [[ "$image" =~ ^ghcr.io/[a-z0-9_.-]+/[a-z0-9_.-]+$ && "$digest" =~ ^sha256:[a-f0-9]{64}$ ]] && safe_image=$image@$digest
  printf 'Release result=%s environment=%s commit=%s image=%s\n' "$outcome" "$safe_target" "$safe_commit" "$safe_image" >> "${GITHUB_STEP_SUMMARY:?}"
  printf 'Phases: compatibility=%s build=%s publication=%s deployment=%s readiness=%s\n' "$compatibility" "$build" "$publication" "$deployment" "$readiness" >> "$GITHUB_STEP_SUMMARY"
  printf 'Maintenance: %s (separate from release readiness)\n' "$maintenance" >> "$GITHUB_STEP_SUMMARY"
  python3 - "$script_dir" "${RUNNER_TEMP:?}/data-operation-report.json" "$deployment" <<'PYREPORT'
import json,sys
from pathlib import Path
sys.path.insert(0,sys.argv[1])
import importlib.util
spec=importlib.util.spec_from_file_location('data_workflow',Path(sys.argv[1])/'data-operation-workflow.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
path=Path(sys.argv[2])
if path.exists():
    value=json.loads(path.read_text());value['deploymentOutcome']=sys.argv[3].replace('_','-')
    path.write_text(json.dumps(value,indent=2)+'\n');module.outputs(value)
PYREPORT
}
trap report EXIT
bash "$script_dir/guard.sh" "$target"
python3 "$script_dir/routes.py" "$target"
python3 "$script_dir/public-package.py" before
for key in VPS_HOST VPS_USER DEPLOY_SSH_PRIVATE_KEY DEPLOY_SSH_HOST_KEY; do
  [[ -n ${!key:-} ]] || { echo "Missing $key" >&2; exit 1; }
done
if [[ "$target" == staging || "$target" == production ]]; then
  export TUNNEL_SERVICE_TOKEN_ID=${CF_ACCESS_CLIENT_ID:-}
  export TUNNEL_SERVICE_TOKEN_SECRET=${CF_ACCESS_CLIENT_SECRET:-}
  bash "$script_dir/access.sh"
  bash "$script_dir/guard.sh" "$target"
  compatibility=unknown
  if python3 "$script_dir/preflight.py"; then
    compatibility=compatible
  else
    code=$?
    [[ "$code" != 2 ]] || compatibility=rejected
    exit "$code"
  fi
fi
image="ghcr.io/${GITHUB_REPOSITORY,,}"
candidate="$RUNNER_TEMP/release-candidate.json"
if [[ -f "$candidate" ]]; then
  digest=$(python3 -c 'import json,sys; from pathlib import Path; sys.path.insert(0,sys.argv[1]); from candidate import validate; print(validate(json.load(open(sys.argv[2])),sys.argv[3],sys.argv[4])["image"].split("@",1)[1])' "$script_dir" "$candidate" "$GITHUB_SHA" "$GITHUB_REPOSITORY")
  build=reused
  publication=reused
else
  printf '%s' "${GH_TOKEN:?}" | docker login ghcr.io -u "${GITHUB_ACTOR:?}" --password-stdin
  build=unknown
  publication=unknown
  docker buildx build --push --tag "$image:$GITHUB_SHA" --label "org.opencontainers.image.revision=$GITHUB_SHA" --label "org.opencontainers.image.source=https://github.com/${GITHUB_REPOSITORY,,}" --metadata-file "$RUNNER_TEMP/image.json" .
  build=succeeded
  publication=succeeded
  digest=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["containerimage.digest"])' "$RUNNER_TEMP/image.json")
  [[ "$digest" =~ ^sha256:[a-f0-9]{64}$ ]] || { echo 'Build did not produce an immutable digest' >&2; exit 1; }
  python3 -c 'import json,sys; json.dump({"sourceCommit":sys.argv[2],"image":sys.argv[3]},open(sys.argv[1],"w"))' "$candidate" "$GITHUB_SHA" "$image@$digest"
fi
[[ "$digest" =~ ^sha256:[a-f0-9]{64}$ ]] || exit 1
if [[ "$target" == staging || "$target" == production ]]; then
python3 "$script_dir/public-package.py" after
# Fresh client configuration prevents runner credentials from authenticating this pull.
anonymous=$(mktemp -d "$RUNNER_TEMP/anonymous-ghcr.XXXXXXXX")
if ! docker --config "$anonymous" pull "$image@$digest"; then
  rm -rf -- "$anonymous"
  echo 'Anonymous digest pull failed; host deployment not attempted' >&2
  exit 1
fi
rm -rf -- "$anonymous"
fi
# Inspect this exact published digest; required work prepares one reviewed plan
# and ends this run without activation. A rerun restores the retained candidate.
python3 "$script_dir/data-operation-workflow.py" report "$target" --image "$image@$digest" --commit "$GITHUB_SHA"
activation=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["activationDecision"])' "$RUNNER_TEMP/data-operation-report.json")
case "$activation" in
  blocked-migrations)
    python3 "$script_dir/data-operation-workflow.py" prepare-migration "$target" --image "$image@$digest" --commit "$GITHUB_SHA"
    outcome=blocked-migrations; deployment=blocked-migrations; readiness=not_attempted
    exit 0 ;;
  blocked-recovery)
    outcome=blocked-recovery; deployment=blocked-recovery; readiness=not_attempted
    exit 0 ;;
  owner-action-required)
    outcome=owner-action-required; deployment=not_attempted; readiness=not_attempted
    exit 1 ;;
  proceed) ;;
  *) echo 'Unrecognized activation decision; activation not attempted' >&2; exit 1 ;;
esac
python3 "$script_dir/quality-summary.py" || echo 'Advisory report unavailable; build succeeded.' >> "$GITHUB_STEP_SUMMARY"
bash "$script_dir/guard.sh" "$target"
# Access setup exports the SSH config for this shell and later cleanup.
if [[ "$target" != staging ]]; then bash "$script_dir/access.sh"; fi
export TUNNEL_SERVICE_TOKEN_ID=${CF_ACCESS_CLIENT_ID:-}
export TUNNEL_SERVICE_TOKEN_SECRET=${CF_ACCESS_CLIENT_SECRET:-}
# Recheck after downloading the access helper, immediately before host contact.
bash "$script_dir/guard.sh" "$target"
deployment=unknown
readiness=unknown
operation_log=$(mktemp "$RUNNER_TEMP/deployment-result.XXXXXXXX")
if bash "$script_dir/host-operation.sh" deploy "$target" "$image@$digest" "$GITHUB_SHA" | tee "$operation_log"; then
  maintenance=$(python3 - "$operation_log" <<'PY'
import re,sys
from pathlib import Path
matches=re.findall(r'^maintenance=(completed|disabled|warning|unknown|replan-required)(?:\s|$)',Path(sys.argv[1]).read_text(),re.M)
print('warning' if any(x in ('warning','unknown','replan-required') for x in matches) else matches[-1] if matches else 'not_reported')
PY
)
  rm -f -- "$operation_log"
else
  code=$?
  if [[ "$target" == staging || "$target" == production ]]; then
    deployment=$(python3 "$script_dir/preflight.py" "$operation_log" "$code")
    [[ "$deployment" != rejected ]] || readiness=not_attempted
  fi
  rm -f -- "$operation_log"
  exit "$code"
fi
deployment=succeeded
readiness=healthy
outcome=healthy
