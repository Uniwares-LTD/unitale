"""Host tests run only in an owned Linux container with mocked external services."""
import json
import hashlib
import os
import shutil
import subprocess
import unittest
from pathlib import Path
from test_config import fixture

REPO = Path(__file__).resolve().parents[2]
SLUG = json.loads((REPO / 'project.config.json').read_text())['slug']
ROOT = Path('/opt') / SLUG
CONFIG = Path('/etc') / SLUG
STATE = Path('/var/lib') / SLUG
SCRIPT = REPO / "scripts/deploy/vps.sh"
PUBLIC = json.loads((REPO / 'deploy/environments/staging.json').read_text())
IMAGE = PUBLIC['deployment']['imageRepository'] or 'ghcr.io/test/unibase'


@unittest.skipUnless(os.environ.get("UNIBASE_DEPLOY_TEST_CONTAINER") == "1" and str(REPO) == "/repo", "Requires owned Linux test container")
class HostTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        assert not ROOT.exists() and not CONFIG.exists() and not STATE.exists()
        cls.bin = Path("/tmp/unibase-mock-bin")
        cls.bin.mkdir()
        gate = cls.bin / 'data-operation-gate.py'
        gate.write_text('''import json,os,sys
from pathlib import Path
expected=json.loads(Path('/tmp/pulled-candidate.json').read_text())
if sys.argv[1:] != expected or os.environ.get('REJECT_ACTIVATION') == '1':
    sys.exit('Fixture activation rejected')
''')
        maintenance = Path('/usr/local/sbin/uniwares-image-maintenance')
        assert not maintenance.exists()
        Path('/var/lib/uniwares-infrastructure').mkdir(exist_ok=True)
        maintenance.write_text('''#!/usr/bin/env python3
import fcntl,json,os,subprocess,sys
from pathlib import Path
args=sys.argv[1:]
with open('/tmp/maintenance-operations','a') as f: f.write(json.dumps(args)+'\\n')
if args[0]=='run-release':
    fd=os.open('/var/lib/uniwares-infrastructure/image-maintenance.lock',os.O_RDWR|os.O_CREAT,0o600)
    fcntl.flock(fd,fcntl.LOCK_EX)
    os.set_inheritable(fd,True)
    os.environ['UNIWARES_IMAGE_LOCK_FD']=str(fd)
    action=args[args.index('--release-action')+1]
    target=args[args.index('--environment')+1]
    target='production' if target=='prod' else target
    script=args[args.index('--script')+1]
    os.execv('/bin/bash',['bash',script,action,target,'--apply',args[args.index('--image')+1],args[args.index('--commit')+1]])
if args[0]=='check-space' and os.environ.get('FAIL_DISK')=='1':
    print('INSUFFICIENT_DISK_SPACE'); sys.exit(2)
if args[0]=='check-space' and os.environ.get('FAIL_DISK_AFTER_PULL')=='1' and Path('/tmp/pulled-commit').exists():
    print('INSUFFICIENT_DISK_SPACE'); sys.exit(2)
if args[0] in ('record','cleanup') and os.environ.get('FAIL_MAINTENANCE')=='1': sys.exit(2)
print(json.dumps({'status':'completed'}))
''')
        maintenance.chmod(0o755)
        policy = Path('/etc/uniwares-infrastructure/image-retention.json')
        policy.parent.mkdir(exist_ok=True)
        policy.write_text(json.dumps({'version':1,'keepReleases':3,'keepDays':14,'minimumFreeGiB':20,
            'targetFreeGiB':30,'warnUsedPercent':80,'projects':{SLUG:{'imageRepository':IMAGE,
                'environments':{'staging':'staging','prod':'production'},'automatic':False}}}))
        mocks = {
            "docker": '''#!/usr/bin/env python3
import json,os,sys,time
from pathlib import Path
args=sys.argv[1:]
with open('/tmp/docker-operations','a') as f: f.write(json.dumps(args)+'\\n')
if args[:1]==['--config']:
    assert args[2]=='pull'
    sys.exit(1 if os.environ.get('FAIL_ANONYMOUS_PULL')=='1' else 0)
if args[0]=='login': sys.exit(0)
if args[:2]==['image','inspect']:
    print(os.environ.get('BAD_IMAGE_REVISION') or Path('/tmp/pulled-commit').read_text())
    sys.exit(0)
if args[:2]==['buildx','build']:
    if os.environ.get('FAIL_BUILD')=='1': sys.exit(1)
    Path(args[args.index('--metadata-file')+1]).write_text(json.dumps({'containerimage.digest':'sha256:'+'b'*64}))
    Path('/tmp/docker-built').touch()
    sys.exit(0)
if args==['compose','version']: print('Docker Compose version v2.35.0'); sys.exit(0)
project=args[args.index('--project-name')+1]
slug=os.environ['DEPLOY_TEST_PROJECT']
if project not in (slug+'-staging',slug+'-production'): sys.exit(99)
env=Path(args[args.index('--env-file')+1])
if 'exec' in args:
    if 'worker-healthcheck.cjs' not in args: sys.exit(99)
    values=dict(line.split('=',1) for line in env.read_text().splitlines())
    if os.environ.get('FAIL_WORKER_COMMIT')==values['RELEASE_COMMIT']: sys.exit(1)
if 'pull' in args and os.environ.get('FAIL_PULL')=='1': sys.exit(1)
if 'pull' in args:
    values=dict(line.split('=',1) for line in env.read_text().splitlines())
    Path('/tmp/pulled-commit').write_text(values['RELEASE_COMMIT'])
    slug=json.loads(Path('/repo/project.config.json').read_text())['slug']
    candidate=[slug,project.removeprefix(slug+'-'),values['IMAGE_DIGEST'],values['RELEASE_COMMIT']]
    Path('/tmp/pulled-candidate.json').write_text(json.dumps(candidate))
if 'up' in args:
    if os.environ.get('HOLD_UP')=='1':
        Path('/tmp/hold-up-started').touch()
        time.sleep(0.6)
    Path('/tmp/active-'+project).write_text(env.read_text())
    with open('/tmp/docker-operations','a') as f: f.write(json.dumps(['up-complete',project])+'\\n')
if 'down' in args: Path('/tmp/active-'+project).unlink(missing_ok=True)
''',
            "curl": '''#!/usr/bin/env python3
import json,os,sys
from pathlib import Path
url=sys.argv[-1]
if url.startswith('https://github.com/cloudflare/cloudflared/releases/'):
    Path(sys.argv[sys.argv.index('--output')+1]).write_text('#!/bin/sh\\nexit 0\\n')
    sys.exit(0)
slug=os.environ['DEPLOY_TEST_PROJECT']
installed=json.loads((Path('/etc')/slug/'config.json').read_text())
target='staging' if (':'+str(installed['staging']['port'])+'/' in url or 'staging.' in url) else 'production'
active=Path('/tmp/active-'+slug+'-'+target)
if not active.exists(): sys.exit(22)
env=dict(x.split('=',1) for x in active.read_text().splitlines())
commit=env['RELEASE_COMMIT']
if os.environ.get('FAIL_COMMIT')==commit: sys.exit(22)
if url.startswith('https:') and os.environ.get('FAIL_HTTPS_COMMIT')==commit: sys.exit(22)
print(json.dumps({'status':'ready','commit':commit}))
''',
            "sleep": "#!/usr/bin/env bash\nexit 0\n",
            "gh": '''#!/usr/bin/env python3
import io,json,os,sys,zipfile
from pathlib import Path
endpoint=sys.argv[2]
commit=os.environ['GITHUB_SHA']
if '/git/ref/' in endpoint:
    print('f'*40 if os.environ.get('STALE_AFTER_BUILD')=='1' and Path('/tmp/docker-built').exists() else os.environ['MOCK_REMOTE_SHA'])
elif '/workflows/' in endpoint:
    print(json.dumps({'workflow_runs':[{'head_sha':commit,'status':'completed','conclusion':'success','id':1}]}))
elif endpoint.endswith('/artifacts'):
    print(json.dumps({'artifacts':[{'name':'quality-'+commit,'expired':False,'id':2}]}))
elif endpoint.endswith('/zip'):
    data=io.BytesIO()
    with zipfile.ZipFile(data,'w') as z:
        z.writestr('run.json',json.dumps({'head':commit,'complete':True,'local':False,'mode':'full'}))
        z.writestr('results.json',json.dumps([{'name':'lint','exitCode':1,'outcome':'warning'}]))
    sys.stdout.buffer.write(data.getvalue())
else: sys.exit(1)
''',
            "python3": '''#!/usr/bin/env bash
if [[ ${1:-} == *public-package.py ]]; then
  exec /usr/bin/python3 /tmp/unibase-mock-bin/package-api.py "$@"
fi
if [[ ${1:-} == *routes.py ]]; then exit 0; fi
exec /usr/bin/python3 "$@"
''',
            "ssh": '''#!/usr/bin/env bash
printf 'ssh\\n' >> /tmp/host-contacts
if [[ ${!#} == operate ]]; then
  exec /usr/bin/python3 /tmp/unibase-mock-bin/dispatch.py
fi
bash -c "${!#}"
''',
            "scp": '''#!/usr/bin/env bash
printf 'scp\\n' >> /tmp/host-contacts
cp -- "$3" "${4#unibase-vps:}"
''',
            "sudo": '''#!/usr/bin/env bash
[[ ${1:-} != -n ]] || shift
exec "$@"
''',
        }
        for name, content in mocks.items():
            file = cls.bin / name
            file.write_text(content)
            file.chmod(0o755)
        (cls.bin / "package-api.py").write_text('''import io,json,os,runpy,sys,urllib.request
def response(request, **kwargs):
    value={'type':'Organization'} if '/users/' in request.full_url else {'visibility':os.environ.get('MOCK_VISIBILITY','public')}
    return io.BytesIO(json.dumps(value).encode())
urllib.request.urlopen=response
filename=sys.argv[1]
sys.argv=sys.argv[1:]
runpy.run_path(filename,run_name='__main__')
''')
        (cls.bin / "dispatch.py").write_text("""import hashlib,importlib.util,json,os,subprocess,sys
from pathlib import Path
r=json.load(sys.stdin)
slug=os.environ['DEPLOY_TEST_PROJECT']
if r['action']=='capabilities':
    print(json.dumps({'version':2,'capabilities':['operation-lock-v1','image-retention-v1','data-operations-v1']})); sys.exit(0)
if os.environ.get('LEGACY_DISPATCHER')=='1':
    print('legacy private failure'); sys.exit(1)
config=json.loads(Path('/repo/deploy/environments/staging.json').read_text())
config['runtime'].pop('DIAGNOSTICS_ENABLED',None)
if os.environ.get('MISMATCH_CONFIG')=='1' or (os.environ.get('CHANGE_AFTER_PREFLIGHT')=='1' and r['action']=='deploy'):
    config['runtime']['MCP_CLIENTS_JSON']='[]'
digest=hashlib.sha256(json.dumps(config,sort_keys=True,separators=(',',':')).encode()).hexdigest()
with open('/tmp/dispatch-actions','a') as f: f.write(r['action']+'\\n')
real=Path('/infrastructure/scripts/deploy-dispatch.py')
if r['action']=='migrations':
    # This host fixture owns the candidate and its empty migration ledger.
    assert set(r)=={'version','project','environment','action','image','commit','requiredCapabilities','configurationHash'}
    assert r['version']==2 and r['environment']=='staging' and r['configurationHash']==digest
    assert r['project']==json.loads(Path('/repo/project.config.json').read_text())['slug']
    assert r['requiredCapabilities']==['data-operations-v1']
    assert r['image']=='ghcr.io/'+os.environ['GITHUB_REPOSITORY']+'@sha256:'+'b'*64
    assert r['commit']==os.environ['GITHUB_SHA']
    print(json.dumps(dict(activationDecision='proceed',image=r['image'],sourceCommit=r['commit'],pending=[])))
    sys.exit(0)
if real.exists():
    spec=importlib.util.spec_from_file_location('dispatcher',real)
    d=importlib.util.module_from_spec(spec); spec.loader.exec_module(d)
    root=Path('/tmp/dispatcher-fixture'); registry=root/'registry'; registry.mkdir(parents=True,exist_ok=True)
    source=root/'control'/slug/('b'*64); (source/'deploy/environments').mkdir(parents=True,exist_ok=True)
    (source/'deploy/environments/staging.json').write_text(json.dumps(config))
    (source/'deploy/contract.json').write_text(Path('/repo/deploy/contract.json').read_text())
    (source/'project.config.json').write_text(json.dumps({'slug':slug}))
    (source/'scripts/deploy').mkdir(parents=True,exist_ok=True)
    # Verify that the dispatcher supplied its gate before substituting the fixture.
    (source/'scripts/deploy/vps.sh').write_text(
        '#!/bin/bash\\n[[ "$UNIWARES_DATA_GATE" == /infrastructure/scripts/data-operation-gate.py ]] || exit 2\\n'
        'export UNIWARES_DATA_GATE=/tmp/unibase-mock-bin/data-operation-gate.py\\n'
        'exec bash /repo/scripts/deploy/vps.sh "$@"\\n')
    (registry/(slug+'.json')).write_text(json.dumps({'revision':'b'*64}))
    d.REGISTRY=registry; d.CONTROL=root/'control'
    d.trusted=lambda path: None  # Temporary fixture ownership; protocol/hash validation stays real.
    d.ENV=dict(os.environ)  # Keep the disposable container's mocked provider executables.
    sys.exit(d.handle(r))
assert set(r)=={'version','project','environment','action','configurationHash','requiredCapabilities'} | ({'image','commit'} if r['action']=='deploy' else set())
assert r['version']==2 and r['environment']=='staging' and r['project']==slug
compatible=r['configurationHash']==digest
if r['action']=='preflight' or not compatible:
    print(json.dumps(dict(version=r['version'],code='COMPATIBLE' if compatible else 'CONFIGURATION_MISMATCH',compatible=compatible,installedRevision='b'*64,installedConfigurationHash=digest,requestedConfigurationHash=r['configurationHash'])))
    sys.exit(0 if compatible else 2)
assert r['action']=='deploy'
sys.exit(subprocess.run(['bash','/repo/scripts/deploy/vps.sh','deploy','staging','--apply',r['image'],r['commit']]).returncode)
""")
        cls.env = dict(os.environ, PATH=f"{cls.bin}:" + os.environ["PATH"], DEPLOY_TEST_PROJECT=SLUG)
        cls.env['UNIWARES_DATA_GATE'] = str(gate)
        # Preview must not create directories or contact Docker.
        result = subprocess.run(["bash", SCRIPT, "setup", "staging"], env=cls.env, capture_output=True)
        assert result.returncode == 0 and not ROOT.exists()
        assert not Path("/tmp/docker-operations").exists()
        result = cls.run_host("setup", "staging")
        assert result.returncode == 0 and not (ROOT / "production").exists()
        assert cls.run_host("setup", "production").returncode == 0

    @classmethod
    def run_host(cls, action, target="staging", commit=None, **extra):
        args = ["bash", str(SCRIPT), action, target, "--apply"]
        if commit:
            args += [IMAGE + "@sha256:" + "b" * 64, commit]
        return subprocess.run(args, env=dict(cls.env, **extra), capture_output=True, text=True, timeout=20)

    def setUp(self):
        for target in ("staging", "production"):
            for link in ("current", "previous"):
                (ROOT / target / link).unlink(missing_ok=True)
            shutil.rmtree(ROOT / target / "releases")
            (ROOT / target / "releases").mkdir()
            Path(f"/tmp/active-{SLUG}-" + target).unlink(missing_ok=True)
        installed=fixture(CONFIG)
        for target in ('staging', 'production'):
            public=json.loads((REPO / f'deploy/environments/{target}.json').read_text())
            item=installed[target]
            for key,value in {'origin':public['runtime']['APP_ORIGIN'],
                              'firebaseProject':public['google']['projectId'],
                              'mongoDatabase':public['runtime']['MONGODB_DATABASE'],
                              'mongoUser':public['atlas']['mongoUser'],
                              **{k:public['deployment'][k] for k in ('port','ingressSubnet','redisImage','nginxImage')}}.items():
                if value is not None: item[key]=value
        item=installed['staging']
        installed['imageRepository']=IMAGE
        (CONFIG/'config.json').write_text(json.dumps(installed))
        runtime=CONFIG/'staging/runtime.env'
        values=dict(line.split('=',1) for line in runtime.read_text().splitlines())
        # Match tracked public bindings using synthetic secrets only. Docker and
        # HTTP are mocked, so optional live modes never contact real providers.
        values.update({key: value for key, value in PUBLIC['runtime'].items() if value is not None})
        values.update(DIFY_MANAGEMENT_KEY='synthetic-management',
                      DIFY_CREDENTIAL_ENCRYPTION_KEY='a' * 64,
                      PERSONA_COMPLETION_API_KEY='synthetic-persona')
        for binding in json.loads(values.get('DIFY_ORCHESTRATORS_JSON', '[]')):
            values[binding['keyEnv']] = 'synthetic-execution'
        for client in json.loads(values.get('MCP_CLIENTS_JSON', '[]')):
            values[client['tokenEnv']] = 'synthetic-mcp-token-' + 'x' * 32
        values.update(APP_ORIGIN=item['origin'],FIREBASE_PROJECT_ID=item['firebaseProject'])
        runtime.write_text(''.join(f'{k}={v}\n' for k,v in values.items()))
        credential=CONFIG/'staging/firebase.json'; saved=json.loads(credential.read_text()); saved['project_id']=item['firebaseProject']; credential.write_text(json.dumps(saved))
        Path("/tmp/docker-operations").write_text("")
        Path("/tmp/docker-built").unlink(missing_ok=True)
        Path("/tmp/host-contacts").write_text("")
        Path("/tmp/dispatch-actions").write_text("")
        Path("/tmp/hold-up-started").unlink(missing_ok=True)
        Path('/tmp/pulled-commit').unlink(missing_ok=True)
        Path('/tmp/maintenance-operations').write_text('')

    def test_disk_failure_before_pull_keeps_services_untouched(self):
        result = self.run_host('deploy', commit='a'*40, FAIL_DISK='1')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('INSUFFICIENT_DISK_SPACE', result.stdout)
        operations = Path('/tmp/docker-operations').read_text()
        self.assertNotIn('"pull"', operations)
        self.assertNotIn('"up"', operations)

    def test_disk_failure_after_pull_does_not_replace_services(self):
        result = self.run_host('deploy', commit='a'*40, FAIL_DISK_AFTER_PULL='1')
        self.assertNotEqual(result.returncode, 0)
        operations = Path('/tmp/docker-operations').read_text()
        self.assertIn('"pull"', operations)
        self.assertNotIn('"up"', operations)

    def test_maintenance_failure_does_not_restore_healthy_release(self):
        result = self.run_host('deploy', commit='a'*40, FAIL_MAINTENANCE='1')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('maintenance=warning', result.stdout)
        self.assertTrue((ROOT/'staging/current').is_symlink())

    def release(self, commit, **extra):
        result = self.run_host("deploy", commit=commit, **extra)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        return (ROOT / "staging/current").resolve()

    def test_failed_activation_gate_keeps_current_release_running(self):
        previous = self.release("a" * 40)
        operations = Path("/tmp/docker-operations")
        for extra, message in (
            ({"REJECT_ACTIVATION": "1"}, "Fixture activation rejected"),
            ({"UNIWARES_DATA_GATE": ""}, "UNSUPPORTED_CAPABILITY: data activation gate required"),
        ):
            with self.subTest(message=message):
                operations.write_text("")
                result = self.run_host("deploy", commit="b" * 40, **extra)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(message, result.stderr)
                self.assertEqual((ROOT / "staging/current").resolve(), previous)
                self.assertNotIn('"up"', operations.read_text())
                self.assertNotIn('"down"', operations.read_text())

    def test_failed_readiness_restores_matching_configuration_and_image(self):
        previous = self.release("a" * 40)
        snapshot = (previous / "runtime.env").read_bytes()
        runtime = CONFIG / "staging/runtime.env"
        runtime.write_text(runtime.read_text().replace("test-public-key", "new-public-key"))
        failed = self.run_host("deploy", commit="b" * 40, FAIL_COMMIT="b" * 40)
        self.assertNotEqual(failed.returncode, 0)
        self.assertIn("result=restored", failed.stdout)
        self.assertEqual((ROOT / "staging/current").resolve(), previous)
        self.assertEqual((previous / "runtime.env").read_bytes(), snapshot)
        self.assertIn("a" * 40, Path(f"/tmp/active-{SLUG}-staging").read_text())

    def test_external_https_failure_also_restores(self):
        previous = self.release("a" * 40)
        failed = self.run_host("deploy", commit="b" * 40, FAIL_HTTPS_COMMIT="b" * 40)
        self.assertNotEqual(failed.returncode, 0)
        self.assertEqual((ROOT / "staging/current").resolve(), previous)
        self.assertIn("result=restored", failed.stdout)

    def test_rollback_retains_matching_credentials_without_data_operations(self):
        previous = self.release("a" * 40)
        original = (previous / "firebase.json").read_bytes()
        (CONFIG / "staging/firebase.json").write_text((CONFIG / "staging/firebase.json").read_text().replace("synthetic-fixture", "rotated-synthetic-key"))
        self.release("b" * 40)
        result = self.run_host("rollback")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual((ROOT / "staging/current").resolve(), previous)
        self.assertEqual((previous / "firebase.json").read_bytes(), original)
        operations = Path("/tmp/docker-operations").read_text()
        for row in map(json.loads, operations.splitlines()):
            if "exec" in row:
                self.assertIn("worker-healthcheck.cjs", row)
        self.assertNotIn('"run"', operations)

    def test_pull_failure_never_replaces_existing_application(self):
        previous = self.release("a" * 40)
        Path("/tmp/docker-operations").write_text("")
        result = self.run_host("deploy", commit="b" * 40, FAIL_PULL="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((ROOT / "staging/current").resolve(), previous)
        self.assertNotIn('"up"', Path("/tmp/docker-operations").read_text())

    def test_failed_worker_restores_previous_release(self):
        previous = self.release("a" * 40)
        result = self.run_host("deploy", commit="b" * 40, FAIL_WORKER_COMMIT="b" * 40)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((ROOT / "staging/current").resolve(), previous)
        self.assertIn("result=restored", result.stdout)

    def test_first_failure_stops_failed_project(self):
        result = self.run_host("deploy", commit="b" * 40, FAIL_COMMIT="b" * 40)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((ROOT / "staging/current").exists())
        self.assertFalse(Path(f"/tmp/active-{SLUG}-staging").exists())

    def test_staging_operations_never_touch_production_or_poc(self):
        result = self.run_host("deploy", target="production", commit="c" * 40)
        self.assertEqual(result.returncode, 0)
        production = (ROOT / "production/current").resolve()
        snapshot = (production / "compose.env").read_bytes()
        Path("/tmp/docker-operations").write_text("")
        self.release("a" * 40)
        operations = Path("/tmp/docker-operations").read_text()
        self.assertNotIn(f"{SLUG}-production", operations)
        self.assertNotIn("kids-booklet", operations)
        self.assertEqual((production / "compose.env").read_bytes(), snapshot)
        (ROOT / "staging/previous").symlink_to(production)
        Path("/tmp/docker-operations").write_text("")
        self.assertNotEqual(self.run_host("rollback").returncode, 0)
        self.assertNotIn('"up"', Path("/tmp/docker-operations").read_text())

    def test_guard_rejects_wrong_environment_branch_and_stale_commit(self):
        guard = REPO / "scripts/deploy/guard.sh"
        env = dict(self.env, GITHUB_REPOSITORY="test/unibase", GITHUB_SHA="a" * 40, MOCK_REMOTE_SHA="a" * 40)
        for target, branch, sha, expected in (("staging", "_staging", "a", 0), ("production", "_staging", "a", 1), ("staging", "_prod", "a", 1), ("staging", "_staging", "b", 1)):
            result = subprocess.run(["bash", guard, target], env=dict(env, GITHUB_REF="refs/heads/" + branch, MOCK_REMOTE_SHA=sha * 40), capture_output=True)
            self.assertEqual(result.returncode, expected)

    def run_release(self, **extra):
        runner = Path("/tmp/unibase-release-runner")
        if runner.exists():
            shutil.rmtree(runner)
        runner.mkdir()
        env = dict(self.env, GITHUB_REPOSITORY=IMAGE.removeprefix('ghcr.io/'), GITHUB_SHA="a" * 40,
                   GITHUB_REF="refs/heads/_staging", MOCK_REMOTE_SHA="a" * 40,
                   GITHUB_ACTOR="synthetic-operator", GH_TOKEN="synthetic-test-token",
                   VPS_HOST="ssh.example.test", VPS_USER="unibase", RUNNER_TEMP=str(runner),
                   CLOUDFLARED_VERSION="2026.1.0", CLOUDFLARED_SHA256=hashlib.sha256(b"#!/bin/sh\nexit 0\n").hexdigest(),
                   DEPLOY_SSH_PRIVATE_KEY="synthetic-private-key", DEPLOY_SSH_HOST_KEY="ssh-ed25519 synthetic-host-key",
                   CF_ACCESS_CLIENT_ID="synthetic-access-id", CF_ACCESS_CLIENT_SECRET="synthetic-access-secret",
                   GITHUB_ENV=str(runner / "github-env"), GITHUB_STEP_SUMMARY=str(runner / "summary"))
        return subprocess.run(["bash", REPO / "scripts/deploy/release.sh", "staging"], cwd=REPO,
                              env=dict(env, **extra), capture_output=True, text=True, timeout=30)

    def test_quality_warning_permits_successful_build_and_deployment(self):
        result = self.run_release()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("a" * 40, (ROOT / "staging/current/compose.env").read_text())
        self.assertIn("Built successfully with quality warnings", Path("/tmp/unibase-release-runner/summary").read_text())
        self.assertIn("ssh", Path("/tmp/host-contacts").read_text())

    def test_failed_build_never_deploys(self):
        result = self.run_release(FAIL_BUILD="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(Path("/tmp/dispatch-actions").read_text(), "preflight\n")
        self.assertFalse((ROOT / "staging/current").exists())

    def test_commit_changed_during_build_never_deploys(self):
        result = self.run_release(STALE_AFTER_BUILD="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Release commit is no longer branch head", result.stderr)
        self.assertEqual(Path("/tmp/dispatch-actions").read_text(), "preflight\nmigrations\n")
        self.assertFalse((ROOT / "staging/current").exists())

    def test_private_package_is_rejected_without_changing_visibility(self):
        result = self.run_release(MOCK_VISIBILITY="private")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("visibility to public", result.stderr)
        self.assertEqual(Path("/tmp/host-contacts").read_text(), "")
        self.assertFalse(Path("/tmp/docker-built").exists())

    def test_anonymous_pull_failure_never_deploys(self):
        result=self.run_release(FAIL_ANONYMOUS_PULL="1")
        self.assertNotEqual(result.returncode,0)
        self.assertEqual(Path('/tmp/dispatch-actions').read_text(),'preflight\n')
        self.assertTrue(Path('/tmp/docker-built').exists())

    def test_host_lock_serializes_competing_releases(self):
        args = ["bash", str(SCRIPT), "deploy", "staging", "--apply",
                IMAGE + "@sha256:" + "b" * 64, "a" * 40]
        first = subprocess.Popen(args, env=dict(self.env, HOLD_UP="1"), stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        import time
        try:
            deadline = time.monotonic() + 10
            while not Path("/tmp/hold-up-started").exists() and time.monotonic() < deadline:
                if first.poll() is not None:
                    out, error = first.communicate()
                    self.fail(out + error)
                time.sleep(0.02)
            self.assertTrue(Path("/tmp/hold-up-started").exists())
            second = self.run_host("deploy", commit="b" * 40)
            out, error = first.communicate(timeout=10)
            self.assertEqual(first.returncode, 0, out + error)
            self.assertEqual(second.returncode, 0, second.stdout + second.stderr)
            current = (ROOT / "staging/current").resolve()
            previous = (ROOT / "staging/previous").resolve()
            self.assertIn("b" * 40, (current / "compose.env").read_text())
            self.assertIn("a" * 40, (previous / "compose.env").read_text())
            operations = [json.loads(line) for line in Path("/tmp/docker-operations").read_text().splitlines()]
            up = [i for i, row in enumerate(operations) if "up" in row]
            completed = [i for i, row in enumerate(operations) if row[0] == "up-complete"]
            self.assertLess(up[0], completed[0])
            self.assertLess(completed[0], up[1])
        finally:
            if first.poll() is None: first.kill()
            first.communicate()

    def test_invalid_credentials_stop_before_image_pull(self):
        (CONFIG / "staging/firebase.json").write_text("{}")
        result = self.run_host("deploy", commit="a" * 40)
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('"pull"', Path("/tmp/docker-operations").read_text())
        self.assertFalse((ROOT / "staging/current").exists())

    def test_infrastructure_changes_require_provisioning_before_pull(self):
        installed = json.loads((CONFIG / "config.json").read_text())
        installed["staging"]["port"] = 35103
        (CONFIG / "config.json").write_text(json.dumps(installed))
        result = self.run_host("deploy", commit="a" * 40)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("provision", result.stderr)
        self.assertNotIn('"pull"', Path("/tmp/docker-operations").read_text())

    def test_image_revision_mismatch_never_replaces_application(self):
        previous = self.release("a" * 40)
        Path("/tmp/docker-operations").write_text("")
        result = self.run_host("deploy", commit="b" * 40, BAD_IMAGE_REVISION="c" * 40)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((ROOT / "staging/current").resolve(), previous)
        self.assertNotIn('"up"', Path("/tmp/docker-operations").read_text())

    def test_setup_is_idempotent_and_check_without_release_fails(self):
        before = (CONFIG / "staging/runtime.env").read_bytes()
        self.assertEqual(self.run_host("setup").returncode, 0)
        self.assertEqual((CONFIG / "staging/runtime.env").read_bytes(), before)
        result = self.run_host("check")
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("result=healthy", result.stdout)

    def test_preflight_rejection_never_builds_publishes_or_deploys(self):
        for flag in ('MISMATCH_CONFIG', 'LEGACY_DISPATCHER'):
            with self.subTest(flag=flag):
                result = self.run_release(**{flag: '1'})
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(Path('/tmp/docker-operations').read_text(), '')
                self.assertFalse((ROOT / 'staging/current').exists())
                self.assertNotIn('legacy private failure', result.stdout + result.stderr)

    def test_change_after_preflight_is_rejected_at_deployment(self):
        result = self.run_release(CHANGE_AFTER_PREFLIGHT='1')
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue(Path('/tmp/docker-built').exists())
        self.assertFalse((ROOT / 'staging/current').exists())
        self.assertIn('CONFIGURATION_MISMATCH', result.stdout)
