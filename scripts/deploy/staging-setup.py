"""Guided staging preparation. Preview is offline; apply requires its exact digest.

Provider mutations and the privileged host handoff remain explicit checkpoints.
Never consumes .env.local or copies another application's host input.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
from urllib.parse import urlsplit

from environment import load


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def export(path, value):
    """Never overwrite credentials, including after an interrupted invocation."""
    if path.is_symlink():
        raise ValueError('Credential export must not be a symlink')
    if path.exists():
        return path.read_text(encoding='utf-8-sig').strip()
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as stream:
        stream.write(value + '\n')
        stream.flush()
        os.fsync(stream.fileno())
    return value


def provider_module():
    spec = importlib.util.spec_from_file_location('staging_bindings', Path(__file__).with_name('staging-bindings.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def mutation_journal(directory):
    def perform(name, operation):
        marker = directory / (name + '.json')
        if marker.exists():
            raise ValueError('Prior provider operation recorded; inspect resource before retry')
        # Exclusive creation also serializes competing applies for this operation.
        fd = os.open(marker, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            json.dump({'status': 'uncertain', 'operation': name}, stream)
            stream.flush()
            os.fsync(stream.fileno())
        result = operation()
        # Only public operation identifiers are retained, never the response body.
        record = {'status': 'response-received', 'operation': name}
        if isinstance(result, dict) and isinstance(result.get('name'), str) and result['name'].startswith('operations/'):
            record['providerOperation'] = result['name']
        temporary = marker.with_suffix('.new')
        export(temporary, json.dumps(record))
        os.replace(temporary, marker)
        return result
    return perform


def github_secrets(config, directory, host_key_file):
    repository = config['deployment']['imageRepository'].removeprefix('ghcr.io/')
    record = host_key_file.read_text().strip()
    if not record.startswith(config['ssh']['host'] + ' ssh-ed25519 ') or '\n' in record:
        raise ValueError('Expected verified host-specific public ED25519 record')
    values = {'DEPLOY_SSH_PRIVATE_KEY': (directory / 'uniwares-deploy-user').read_bytes(),
              'DEPLOY_SSH_HOST_KEY': record.encode(),
              'CLOUDFLARE_READ_TOKEN': read_json(directory / 'cloudflare-discovery.json')['apiToken'].encode()}
    for name, value in values.items():
        result = subprocess.run(['gh', 'secret', 'set', name, '--repo', repository], input=value, capture_output=True)
        if result.returncode:
            raise ValueError('Repository secret update failed; rerun safely after checking GitHub access')


def inspect(root, project, revision, directory, environment="staging"):
    if not re.fullmatch(r'[a-z][a-z0-9-]{2,39}', project):
        raise ValueError('Invalid project slug')
    if not re.fullmatch(r'[a-f0-9]{40}', revision):
        raise ValueError('Full reviewed source commit required')
    actual = subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip()
    if actual != revision:
        raise ValueError('Checkout differs from reviewed revision')
    manifest = read_json(root / 'project.config.json')
    if manifest['slug'] != project:
        raise ValueError('Project differs from checkout identity')
    config = load(environment, root=root)
    runtime = config['runtime']
    database = project.replace('-', '_') + '_' + environment
    if runtime['MONGODB_DATABASE'] != database or config['atlas']['mongoUser'] != database:
        raise ValueError('Application database/user must match destination identity')
    origin = urlsplit(runtime['APP_ORIGIN'])
    if origin.scheme != 'https' or origin.username or origin.path not in ('', '/'):
        raise ValueError('Staging HTTPS origin required')
    if runtime.get('PAYMENTS_MODE', 'disabled') != 'disabled' or runtime.get('ASSET_STORE', 'mongo') != 'mongo':
        raise ValueError('This milestone requires payments disabled and MongoDB assets')
    required = {
        f'firebase-{environment}-service-account.json': ('project_id', 'client_email', 'private_key'),
        'cloudflare-discovery.json': ('apiToken',),
        'atlas-discovery.json': (),
        f'{project}-{environment}-web.json': ('projectId', 'appId', 'apiKey', 'authDomain'),
        f'{project}-{environment}-database.json': ('database', 'username', 'password'),
        f'{project}-{environment}-host-input.json': ('mongodbUri', 'firebaseApiKey', 'firebaseAppId'),
        'uniwares-deploy-user': None,
    }
    # Preserve the already distributed Unibase web filename; children need their own registration.
    if project == 'unibase' and environment == 'staging':
        required['firebase-staging-web.json'] = required.pop(f'{project}-{environment}-web.json')
    missing, invalid, found = [], [], {}
    for name, fields in required.items():
        path = directory / name
        if not path.is_file():
            missing.append(name)
            continue
        try:
            if path.is_symlink():
                raise ValueError()
            if fields is None:
                if 'PRIVATE KEY-----' not in path.read_text():
                    raise ValueError()
                continue
            value = read_json(path)
            if not isinstance(value, dict) or any(not isinstance(value.get(k), str) or not value[k].strip() for k in fields):
                raise ValueError()
            if name == 'atlas-discovery.json' and not any(all(value.get(k) for k in pair) for pair in [('publicKey', 'privateKey'), ('clientId', 'clientSecret')]):
                raise ValueError()
            if 'service-account' in name and value['project_id'] != config['google']['projectId']:
                raise ValueError()
            if name.endswith('-web.json') and (value['projectId'] != runtime['FIREBASE_PROJECT_ID'] or value['authDomain'] != origin.hostname):
                raise ValueError()
            if name.endswith('-database.json') and (value['database'] != database or value['username'] != database):
                raise ValueError()
            if name.endswith('-host-input.json'):
                uri = urlsplit(value['mongodbUri'])
                if uri.scheme != 'mongodb+srv' or uri.username != database or not uri.password or not isinstance(value.get('firebase'), dict) or value['firebase'].get('project_id') != config['google']['projectId']:
                    raise ValueError()
            found[name] = value
        except (ValueError, KeyError, UnicodeError):
            invalid.append(name)
    ai_files = {}
    if runtime.get('DIFY_MODE') == 'live':
        ai_files['DIFY_MANAGEMENT_KEY'] = f'{environment}-dify-management.txt'
        bindings = json.loads(runtime.get('DIFY_ORCHESTRATORS_JSON', '[]'))
        if len(bindings) != 1:
            raise ValueError('Guided starter setup requires exactly one reviewed Dify binding')
        ai_files[bindings[0]['keyEnv']] = environment+'-dify-execution-' + project + '.txt'
    if runtime.get('MCP_ENABLED') == 'true':
        clients = json.loads(runtime.get('MCP_CLIENTS_JSON', '[]'))
        if len(clients) != 1:
            raise ValueError('Guided setup requires one reviewed MCP client')
        ai_files[clients[0]['tokenEnv']] = f'{environment}-mcp-token-dify.txt'
    if ai_files:
        ai_files['DIFY_CREDENTIAL_ENCRYPTION_KEY'] = f'{environment}-dify-credential-encryption.txt'
    if runtime.get('PERSONA_COMPLETION_MODE') == 'live':
        ai_files['PERSONA_COMPLETION_API_KEY'] = f'{environment}-persona-completion.txt'
    ai = {}
    for variable, filename in ai_files.items():
        path = directory / project / environment / filename
        if not path.is_file():
            missing.append(project + '/' + environment + '/' + filename)
            continue
        value = path.read_text(encoding='utf-8-sig').strip()
        if not value or any(c in value for c in '\r\n\0') or path.is_symlink():
            invalid.append(project + '/' + environment + '/' + filename)
        else:
            ai[variable] = value
    found['ai'] = ai
    return config, found, missing, invalid


def preview(root, project, revision, directory, environment="staging"):
    config, found, missing, invalid = inspect(root, project, revision, directory, environment)
    plan = {
        'version': 1, 'project': project, 'environment': environment, 'revision': revision,
        'configurationHash': digest(config), 'missingFiles': missing, 'invalidFiles': invalid,
        'destination': {'origin': config['runtime']['APP_ORIGIN'], 'database': config['runtime']['MONGODB_DATABASE'],
                        'host': config['ssh']['host'], 'port': config['deployment']['port'],
                        'subnet': config['deployment']['ingressSubnet'], 'image': config['deployment']['imageRepository']},
        'automatedApply': ['Create/reuse protected per-app Redis, MCP and Dify encryption exports'],
        'manualOrAgentCheckpoints': [
            'Verify provider permissions; discovery credentials alone do not establish write access',
            'Create/reconcile destination Firebase web registration and Auth authorized domain; preserve shared project settings',
            'Verify Google sign-in opens the Firebase popup on <project>.firebaseapp.com (no per-host OAuth origin/redirect registration needed)',
            'Create/reconcile destination Atlas readWrite user and approved host network access; retain its password',
            'Verify host routes, Docker networks and listener allocation through protected operator discovery',
            'Apply hostname route through the existing tunnel owner workflow',
            'Create dedicated Dify starter app and MCP connection; retain app ID/key and validate selected models',
            'Review root-owned bootstrap/configuration bundle and run one checksum-verified operator batch',
            'Populate only existing GitHub repository secret interfaces; verify public GHCR policy',
            'Release reviewed '+('_prod' if environment=='production' else '_staging')+' revision, verify authentication/workers/MCP and bounded AI acceptance',
        ],
    }
    return plan, found


def apply(plan, found, directory, expected):
    if digest(plan) != expected:
        raise ValueError('Preview changed; review the new preview before apply')
    if plan['missingFiles'] or plan['invalidFiles']:
        raise ValueError('Resolve all missing/invalid files in one handoff before apply')
    project = plan['project']
    environment = plan['environment']
    # A child-specific subdirectory prevents accidental reuse of generated Unibase credentials.
    target = directory / project / environment
    target.mkdir(parents=True, exist_ok=True, mode=0o700)
    if target.is_symlink():
        raise ValueError('Protected output must not be a symlink')
    for filename, value, pattern in [
        (f'{environment}-redis-password.txt', secrets.token_urlsafe(32), r'[A-Za-z0-9_-]{43,256}'),
        (f'{environment}-mcp-token-dify.txt', secrets.token_urlsafe(32), r'[A-Za-z0-9_-]{43,256}'),
        (f'{environment}-dify-credential-encryption.txt', secrets.token_hex(32), r'[a-f0-9]{64}'),
    ]:
        if not re.fullmatch(pattern, export(target / filename, value)):
            raise ValueError('Existing generated credential has invalid format; do not replace it automatically')
    host_input_path = directory / (project + '-'+environment+'-host-input.json')
    if host_input_path.exists():
        host_input = read_json(host_input_path)
        if set(host_input) != {'firebase', 'mongodbUri', 'firebaseApiKey', 'firebaseAppId'}:
            raise ValueError('Unexpected original host-input fields')
        host_input['redisPassword'] = (target / f'{environment}-redis-password.txt').read_text().strip()
        if found.get('ai'):
            host_input['ai'] = found['ai']
        prepared = target / (project + '-'+environment+'-host-input' + ('-ai' if found.get('ai') else '') + '.json')
        if json.loads(export(prepared, json.dumps(host_input, indent=2))) != host_input:
            raise ValueError('Prepared host input differs; inspect retained credentials before resuming')
    # MongoDB URI is assembled later from the verified Atlas cluster endpoint, never guessed.
    record = {'project': project, 'revision': plan['revision'], 'previewDigest': digest(plan),
              'status': 'local-credentials-prepared', 'providerBindings': 'verification-required'}
    existing = target / 'setup-progress.json'
    if existing.exists() and read_json(existing).get('project') != project:
        raise ValueError('Progress identity conflict')
    export(existing, json.dumps(record, indent=2))
    return {'status': record['status'], 'next': 'Complete provider bindings and reviewed operator handoff; no live deployment was performed'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', required=True)
    parser.add_argument('--environment', choices=['staging','prod','production'], default='staging')
    parser.add_argument('--revision', required=True)
    parser.add_argument('--credential-directory', required=True, type=Path)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--apply-preview', help='Exact SHA-256 printed by preview')
    parser.add_argument('--providers', action='store_true', help='Read provider state; apply supported Firebase/Atlas bindings')
    parser.add_argument('--github', action='store_true', help='Set only the three existing repository secrets on apply')
    parser.add_argument('--host-key-file', type=Path, help='Verified public host trust record, required with --github')
    args = parser.parse_args()
    os.umask(0o077)
    environment = 'production' if args.environment == 'prod' else args.environment
    if args.credential_directory.resolve().is_relative_to(args.root.resolve()):
        raise ValueError('Credential directory must be outside the application checkout')
    if subprocess.run(['git', '-C', str(args.root), 'diff', '--quiet', 'HEAD', '--', 'scripts/deploy', 'project.config.json', 'deploy/environments'], capture_output=True).returncode:
        raise ValueError('Commit and review setup/configuration changes before initializing')
    plan, found = preview(args.root.resolve(), args.project, args.revision, args.credential_directory.resolve(), environment)
    config = load(environment, root=args.root.resolve())
    if args.github:
        if not args.host_key_file:
            raise ValueError('GitHub initialization requires a verified public host-key file')
        plan['githubSecrets'] = ['DEPLOY_SSH_PRIVATE_KEY', 'DEPLOY_SSH_HOST_KEY', 'CLOUDFLARE_READ_TOKEN']
        plan['hostTrustHash'] = hashlib.sha256(args.host_key_file.read_bytes()).hexdigest()
    api = None
    if args.providers:
        # Missing setup access is reported together; no request is attempted without both identities.
        required = [f'firebase-{environment}-service-account.json', 'atlas-discovery.json']
        if all(name in found for name in required):
            module = provider_module()
            api = module.Providers(found[required[0]], found[required[1]])
            web_file = 'firebase-staging-web.json' if args.project == 'unibase' and environment == 'staging' else args.project + '-'+environment+'-web.json'
            plan['providerObservation'] = module.discover(api, config, args.project, found.get(web_file, {}).get('appId'))
            plan['automatedApply'] += ['Reconcile destination Firebase registration/authorized domain and scoped Atlas user']
    if args.apply_preview:
        if digest(plan) != args.apply_preview or plan['invalidFiles']:
            raise ValueError('Reviewed preview changed or invalid inputs remain')
        if args.providers:
            if api is None:
                raise ValueError('Missing provider setup access')
            generated = {'firebase-staging-web.json', args.project + '-'+environment+'-web.json', args.project + '-'+environment+'-database.json', args.project + '-'+environment+'-host-input.json'}
            if set(plan['missingFiles']) - generated:
                raise ValueError('Missing protected setup files')
            progress = args.credential_directory / args.project / environment / 'provider-progress'
            progress.mkdir(parents=True, exist_ok=True, mode=0o700)
            module.reconcile(api, config, args.project, plan['providerObservation'], args.credential_directory, export, mutation_journal(progress))
            print(json.dumps({'status': 'provider-bindings-prepared', 'next': 'Rerun preview without --providers to prepare local credentials; verify console OAuth and host allocation'}, indent=2))
            return
        if args.github:
            if plan['missingFiles']:
                raise ValueError('Missing protected inputs')
            github_secrets(config, args.credential_directory, args.host_key_file)
        print(json.dumps(apply(plan, found, args.credential_directory.resolve(), args.apply_preview), indent=2))
    else:
        print(json.dumps({'previewDigest': digest(plan), **plan}, indent=2))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Never expose provider payloads, credentials, or JSON parse excerpts.
        print('Setup stopped (' + type(error).__name__ + '); inspect named inputs and preview prerequisites.', file=sys.stderr)
        sys.exit(1)
