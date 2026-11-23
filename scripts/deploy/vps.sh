#!/usr/bin/env bash
# Only fixed Unibase paths and Compose projects are managed. Never source env files.
set -Eeuo pipefail
set +x
umask 077
action=${1:-}
target=${2:-}
[[ "$target" != prod ]] || target=production
mode=${3:-}
image=${4:-}
commit=${5:-}
case "$action" in setup|deploy|check|rollback) ;; *) echo 'Use setup|deploy|check|rollback staging|production [--apply] [digest commit]' >&2; exit 2 ;; esac
case "$target" in staging|production) ;; *) echo 'Invalid target' >&2; exit 2 ;; esac
case "$mode" in ''|--apply) ;; *) echo 'Invalid mode' >&2; exit 2 ;; esac
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
slug=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["slug"])' "$script_dir/../../project.config.json")
[[ "$slug" =~ ^[a-z][a-z0-9-]{2,39}$ ]] || { echo 'Invalid project identity' >&2; exit 1; }
root=/opt/$slug
config=/etc/$slug
state=/var/lib/$slug
project=$slug-$target
base=$root/$target
if [[ "$mode" != --apply ]]; then
  printf 'Preview: %s %s; only %s, %s, %s and project %s\n' "$action" "$target" "$root" "$config" "$state" "$project"
  exit 0
fi
[[ $(id -u) == 0 ]] || { echo 'Apply requires the configured privileged operator' >&2; exit 1; }
for tool in docker python3 curl flock; do command -v "$tool" >/dev/null; done
docker compose version >/dev/null
install -d -m 0700 "$root" "$config" "$state"
if [[ -n "${UNIWARES_OPERATION_LOCK_FD:-}" ]]; then
  [[ "$UNIWARES_OPERATION_LOCK_FD" =~ ^[0-9]+$ ]] || exit 2
  python3 "$script_dir/verify-operation-lock.py" "$UNIWARES_OPERATION_LOCK_FD" "$state/operation.lock"
else
  exec 9>"$state/operation.lock"
  flock -w 300 9 || { echo 'Unibase operation already running' >&2; exit 1; }
  export UNIWARES_OPERATION_LOCK_FD=9
fi
if [[ "$action" == setup ]]; then
  install -d -m 0700 "$base/releases" "$config/$target" "$config/$target/docker"
  echo 'Unibase directories ready; existing host services unchanged'
  exit 0
fi
[[ -d "$base/releases" ]] || { echo 'Run Unibase setup first' >&2; exit 1; }
if [[ "$action" == deploy || "$action" == rollback ]]; then
# Infrastructure owns the image lock and policy. Re-enter with both verified
# descriptors so direct and dispatcher operations follow the same lock ordering.
maintenance=/usr/local/sbin/uniwares-image-maintenance
[[ -x "$maintenance" ]] || { echo 'UNSUPPORTED_CAPABILITY: install image-retention-v1 and enroll this project' >&2; exit 2; }
if [[ -z "${UNIWARES_IMAGE_LOCK_FD:-}" ]]; then
  external_target=$target
  [[ "$target" != production ]] || external_target=prod
  exec "$maintenance" run-release "$slug" --environment "$external_target" \
    --script "$script_dir/vps.sh" --release-action "$action" --image "$image" --commit "$commit"
fi
python3 "$script_dir/verify-operation-lock.py" "$UNIWARES_IMAGE_LOCK_FD" /var/lib/uniwares-infrastructure/image-maintenance.lock
fi
if [[ "$target" == staging || "$target" == production ]]; then
  anonymous_config=$(mktemp -d "$state/anonymous-docker.XXXXXXXX")
  trap 'rm -rf -- "$anonymous_config"' EXIT
  export DOCKER_CONFIG=$anonymous_config
else
  export DOCKER_CONFIG=$config/$target/docker
fi
compose() { docker compose --project-name "$project" --env-file "$1/compose.env" -f "$1/compose.yml" "${@:2}"; }
report() {
  local outcome=$1 release=$2 saved_commit saved_image
  saved_commit=$(sed -n 's/^RELEASE_COMMIT=//p' "$release/compose.env")
  saved_image=$(sed -n 's/^IMAGE_DIGEST=//p' "$release/compose.env")
  [[ "$saved_commit" =~ ^[a-f0-9]{40}$ && "$saved_image" =~ ^ghcr.io/[a-z0-9_.-]+/[a-z0-9_.-]+@sha256:[a-f0-9]{64}$ ]] || return 1
  printf 'result=%s environment=%s commit=%s image=%s\n' "$outcome" "$target" "$saved_commit" "$saved_image"
}
check_release() {
  local release=$1 origin port expected
  local worker worker_ok attempt
  # Retained pre-heartbeat releases must remain rollback-compatible.
  if grep -q 'worker-healthcheck.cjs' "$release/compose.yml"; then
  for worker in worker ai-worker; do
    worker_ok=false
    for ((attempt=0; attempt<24; attempt++)); do
      if compose "$release" exec -T "$worker" node worker-healthcheck.cjs "$([[ "$worker" == worker ]] && echo payment || echo ai)"; then
        worker_ok=true; break
      fi
      sleep 3
    done
    [[ "$worker_ok" == true ]] || return 1
  done
  else
    echo 'Legacy release has no worker probe; worker health is unverified' >&2
  fi
  origin=$(sed -n 's/^APP_ORIGIN=//p' "$release/runtime.env")
  port=$(sed -n 's/^APP_PORT=//p' "$release/compose.env")
  expected=$(sed -n 's/^RELEASE_COMMIT=//p' "$release/compose.env")
  local probe
  for probe in "http://127.0.0.1:$port" "$origin"; do
    local ok=false
    for ((attempt=0; attempt<12; attempt++)); do
      if curl --silent --fail --max-time 7 "$probe/api/health/ready" | \
        python3 -c 'import json,sys; x=json.load(sys.stdin); sys.exit(0 if x.get("status")=="ready" and x.get("commit")==sys.argv[1] else 1)' "$expected" 2>/dev/null; then
        ok=true; break
      fi
      sleep 3
    done
    [[ "$ok" == true ]] || return 1
  done
}
current=''
[[ ! -L "$base/current" ]] || current=$(readlink -f "$base/current")
if [[ -n "$current" ]]; then
  [[ "$current" == "$base/releases/"* && -f "$current/compose.env" ]] || { echo 'Invalid retained release path' >&2; exit 1; }
  grep -qx "DEPLOY_ENV=$target" "$current/compose.env" || { echo 'Retained environment mismatch' >&2; exit 1; }
fi
if [[ "$action" == check ]]; then
  [[ -n "$current" ]] || { echo 'No current release' >&2; exit 1; }
  check_release "$current"
  report healthy "$current"
  exit 0
fi
"$maintenance" check-space "$slug"
if [[ "$action" == rollback ]]; then
  [[ -L "$base/previous" ]] || { echo 'No retained previous release' >&2; exit 1; }
  candidate=$(readlink -f "$base/previous")
  [[ "$candidate" == "$base/releases/"* && -f "$candidate/compose.env" ]] || { echo 'Invalid rollback path' >&2; exit 1; }
  grep -qx "DEPLOY_ENV=$target" "$candidate/compose.env" || { echo 'Rollback environment mismatch' >&2; exit 1; }
else
  [[ "$image" =~ ^ghcr.io/[a-z0-9_.-]+/[a-z0-9_.-]+@sha256:[a-f0-9]{64}$ ]] || { echo 'Immutable GHCR digest required' >&2; exit 1; }
  [[ "$commit" =~ ^[a-f0-9]{40}$ ]] || { echo 'Invalid commit' >&2; exit 1; }
  python3 "$script_dir/check-tracked.py" "$config" "$target"
  values=$(python3 "$script_dir/config.py" "$config" "$target")
  mapfile -t settings <<< "$values"
  [[ "$image" == "${settings[3]}@"* ]] || { echo 'Image repository does not match Unibase configuration' >&2; exit 1; }
  candidate=$(mktemp -d "$base/releases/$commit.XXXXXXXX")
  cp "$script_dir/../../deploy/compose.yml" "$candidate/compose.yml"
  cp "$config/$target/runtime.env" "$candidate/runtime.env"
  python3 "$script_dir/render-runtime.py" "$target" "$candidate/runtime.env"
  python3 "$script_dir/config.py" "$config" "$target" "$candidate/runtime.env" >/dev/null
  cp "$config/$target/firebase.json" "$candidate/firebase.json"
  python3 -c 'from pathlib import Path; from ipaddress import ip_network; import sys; gateway=str(ip_network(sys.argv[3]).network_address+1); Path(sys.argv[2]).write_text(Path(sys.argv[1]).read_text().replace("INGRESS_GATEWAY", gateway))' "$script_dir/../../deploy/nginx.conf" "$candidate/nginx.conf" "${settings[6]}"
  chmod 0444 "$candidate/nginx.conf"
  cp "$config/$target/redis-password" "$candidate/redis-password"
  chown 1001:1001 "$candidate/redis-password"
  chmod 0400 "$candidate/redis-password"
  chown 1001:1001 "$candidate/firebase.json"
  chmod 0400 "$candidate/firebase.json"
  printf 'DEPLOY_ENV=%s\nIMAGE_DIGEST=%s\nRELEASE_COMMIT=%s\nAPP_PORT=%s\n' \
    "$target" "$image" "$commit" "${settings[1]}" > "$candidate/compose.env"
  printf 'PROJECT_SLUG=%s\n' "$slug" >> "$candidate/compose.env"
  ingress_subnet=${settings[6]}
  printf 'REDIS_IMAGE=%s\nNGINX_IMAGE=%s\nINGRESS_SUBNET=%s\n' "${settings[4]}" "${settings[5]}" "$ingress_subnet" >> "$candidate/compose.env"

fi
# Pull/configure before replacing the existing instance. No DB mutations occur.
compose "$candidate" config --quiet
compose "$candidate" pull --quiet
"$maintenance" check-space "$slug"
candidate_image=$(sed -n 's/^IMAGE_DIGEST=//p' "$candidate/compose.env")
candidate_commit=$(sed -n 's/^RELEASE_COMMIT=//p' "$candidate/compose.env")
[[ "$candidate_image" =~ ^ghcr.io/[a-z0-9_.-]+/[a-z0-9_.-]+@sha256:[a-f0-9]{64}$ && "$candidate_commit" =~ ^[a-f0-9]{40}$ ]] || { echo 'Invalid retained image identity' >&2; exit 1; }
revision=$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$candidate_image")
[[ "$revision" == "$candidate_commit" ]] || { echo 'Image revision does not match the release commit' >&2; exit 1; }
# The installed controller owns authoritative data evidence. Gate before the
# activation/restoration trap: a blocked release must not restart either image.
if python3 -c 'import json,sys; sys.exit(0 if "data-operations-v1" in json.load(open(sys.argv[1]))["requiredCapabilities"] else 1)' "$script_dir/../../deploy/contract.json"; then
  [[ -n "${UNIWARES_DATA_GATE:-}" ]] || { echo 'UNSUPPORTED_CAPABILITY: data activation gate required' >&2; exit 2; }
  python3 -IB "$UNIWARES_DATA_GATE" "$slug" "$target" "$candidate_image" "$candidate_commit"
fi
restore() {
  trap - ERR INT TERM HUP
  if [[ -n "$current" ]]; then
    if compose "$current" up -d --remove-orphans && check_release "$current"; then report restored "$current"; else echo 'Previous release restoration failed; operator intervention required' >&2; fi
  else
    compose "$candidate" down
    echo 'First release failed; no previous release exists' >&2
  fi
  exit 1
}
trap restore ERR INT TERM HUP
compose "$candidate" up -d --remove-orphans
check_release "$candidate"
if [[ -n "$current" ]]; then ln -sfn "$current" "$base/previous"; fi
ln -sfn "$candidate" "$base/current"
trap - ERR INT TERM HUP
report healthy "$candidate"
external_target=$target
[[ "$target" != production ]] || external_target=prod
if "$maintenance" record "$slug" --environment "$external_target"; then
  if [[ "${UNIWARES_DISPATCHED:-}" != 1 ]]; then
    "$maintenance" cleanup "$slug" || echo 'maintenance=warning operator-inspection-required'
  fi
else
  echo 'maintenance=warning release-ledger-not-recorded; cleanup blocked'
fi
