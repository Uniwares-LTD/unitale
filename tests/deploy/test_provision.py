"""Synthetic provider/host fixtures. These tests never contact live services."""
import base64
import copy
import importlib
import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "scripts/deploy"))
environment = importlib.import_module("environment")
provisioning = importlib.import_module("provision")
providers = importlib.import_module("providers")
routes = importlib.import_module("routes")


def environment_fixture(root):
    (root / "deploy/environments").mkdir(parents=True)
    (root / "scripts/deploy").mkdir(parents=True)
    (root / "project.config.json").write_bytes((REPO / "project.config.json").read_bytes())
    (root / "scripts/deploy/environment-catalog.json").write_bytes((REPO / "scripts/deploy/environment-catalog.json").read_bytes())
    for i, target in enumerate(("staging", "production")):
        config = json.loads((REPO / f"deploy/environments/{target}.json").read_text())
        config["runtime"].update(APP_ORIGIN=f"https://{target}.example.test", FIREBASE_PROJECT_ID=f"unibase-{target}-fixture")
        # Initial preparation fixtures stay independent of optional live staging activation.
        config["runtime"].update(DIFY_MODE="disabled", MCP_ENABLED="false", PERSONA_COMPLETION_MODE="disabled")
        for key in ("DIFY_ORCHESTRATORS_JSON", "MCP_CLIENTS_JSON"):
            config["runtime"].pop(key, None)
        config["deployment"].update(imageRepository="ghcr.io/test/unibase", redisImage="redis@sha256:" + "a" * 64,
                                    nginxImage="nginx@sha256:" + "b" * 64, adminImage="node@sha256:" + "c" * 64)
        config["ssh"].update(host="ssh.example.test", user="operator", cloudflaredVersion="2026.1.0", cloudflaredSha256="d" * 64)
        config["google"].update(projectId=config["runtime"]["FIREBASE_PROJECT_ID"], parent="folders/1234",
                               workloadIdentityProvider="projects/123/locations/global/workloadIdentityPools/ci/providers/github",
                               provisionerServiceAccount="provisioner@example.test")
        config["atlas"].update(projectId="a" * 24, clusterName="shared", vpsEgressCidr="192.0.2.1/32")
        config["shared"].update(ownerRepository="fixture/owner", ownerRef="master", tunnelId="11111111-1111-4111-8111-111111111111",
                               cloudflareAccountId="b" * 32, cloudflareZoneId="c" * 32)
        config["ghcr"]["pullUser"] = "fixture"
        (root / f"deploy/environments/{target}.json").write_text(json.dumps(config))
    return environment.load("staging", root)


class HostPreflightTests(unittest.TestCase):
    def check_networks(self, networks):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = environment_fixture(root)
            host = provisioning.Host(config, "unibase", root / "private")

            def run(args, **kwargs):
                if args == ["docker", "info"]:
                    output = ""
                elif args == ["docker", "compose", "version", "--short"]:
                    output = "5.6.1"
                elif args == ["docker", "network", "ls", "-q"]:
                    output = "host none bridge"
                elif args == ["docker", "network", "inspect", "host", "none", "bridge"]:
                    output = json.dumps(networks)
                else:
                    raise AssertionError(args)
                return provisioning.subprocess.CompletedProcess(args, 0, stdout=output)

            with patch.object(provisioning.subprocess, "run", side_effect=run), patch.object(provisioning.socket, "socket"):
                host.preflight()

    def test_builtin_networks_with_null_ipam_do_not_block_preflight(self):
        self.check_networks([
            {"Name": "host", "Labels": None, "IPAM": {"Config": None}},
            {"Name": "none", "IPAM": None},
            {"Name": "bridge", "IPAM": {"Config": [{"Subnet": "192.0.2.0/24"}]}},
        ])

    def test_null_ipam_does_not_hide_an_allocated_subnet(self):
        with self.assertRaisesRegex(ValueError, "subnet is already allocated"):
            self.check_networks([
                {"Name": "host", "Labels": None, "IPAM": {"Config": None}},
                {"Name": "other-app", "IPAM": {"Config": [{"Subnet": "0.0.0.0/0"}]}},
            ])


class FakeAPI:
    def __init__(self, config):
        self.config = config
        self.operations = []
        self.user = None
        self.account = None
        self.key = None
        self.apps = []
        self.policy = {"etag": "fixture", "bindings": []}
        self.project = {"name": "projects/123", "state": "ACTIVE"}

    def google(self, service, path, method="GET", body=None, missing=False):
        self.operations.append((service, method, path, body))
        if service == "cloudresourcemanager":
            if path == "v3/projects" and method == "POST":
                self.project = {"name": "projects/123", "state": "ACTIVE", "labels": body["labels"], "parent": body["parent"]}
                return {"name": "operations/project"}
            if path == "v3/operations/project":
                return {"done": True}
            if "testIamPermissions" in path:
                return {"permissions": body["permissions"]}
            if "getIamPolicy" in path:
                return copy.deepcopy(self.policy)
            if "setIamPolicy" in path:
                self.policy = copy.deepcopy(body["policy"])
                return self.policy
            return self.project
        if service == "serviceusage":
            return {"name": "operations/fixture"}
        if service == "firebase":
            if "/webApps?" in path:
                return {"apps": self.apps}
            if path.endswith("/webApps"):
                app = {"name": "projects/fixture/webApps/fixture", "displayName": body["displayName"]}
                self.apps.append(app)
                return {"name": "operations/app"}
            if path.endswith("/config"):
                return {"apiKey": "public-fixture", "appId": "public-app-fixture"}
            return {"name": "projects/fixture"}
        if service == "identitytoolkit":
            return {"authorizedDomains": ["existing.example.test"]} if "defaultSupportedIdpConfigs" not in path else None
        if service == "iam":
            if path.endswith("/serviceAccounts"):
                self.account = body["serviceAccount"]
                return self.account
            if "/keys?" in path:
                return {"keys": [{"name": "saved-key"}] if self.key else []}
            if path.endswith("/keys"):
                self.key = {"type": "service_account", "project_id": self.config["google"]["projectId"],
                            "client_email": path.split("serviceAccounts/")[1].split("/")[0],
                            "private_key": "private-key-canary", "private_key_id": "fixture-key-id"}
                return {"privateKeyData": base64.b64encode(json.dumps(self.key).encode()).decode()}
            if "/keys/" in path:
                return {}
            return self.account
        raise AssertionError((service, path))

    def wait(self, service, operation, timeout=600):
        return self.apps[-1] if operation == "operations/app" else {}

    def atlas(self, path, method="GET", body=None, missing=False):
        self.operations.append(("atlas", method, path, body))
        if path.endswith("/databaseUsers"):
            self.user = copy.deepcopy(body)
            return self.user
        if "/databaseUsers/admin/" in path:
            return self.user
        if "/clusters/" in path:
            return {"stateName": "IDLE", "connectionStrings": {"standardSrv": "mongodb+srv://fixture.example.test/"}}
        if "/accessList" in path:
            return {"results": []}
        return {"id": self.config["atlas"]["projectId"]}


class FakeHost(provisioning.Host):
    fail_indexes = False

    def preflight(self):
        pass

    def registry_preflight(self, credentials):
        pass

    def indexes(self, checkout, uid=None, migrate=False):
        self.migrated = migrate
        if self.fail_indexes:
            raise ValueError("Synthetic index failure")


class ProvisionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.config = environment_fixture(self.root)
        self.host = FakeHost(self.config, "unibase", self.root / "private")
        self.api = FakeAPI(self.config)
        self.resources = providers.Resources(self.api, self.config, "unibase")
        self.credentials = {"GHCR_PULL_TOKEN": "pull-token-canary"}

    def run_provision(self, apply=True):
        output = io.StringIO()
        with patch("provision.subprocess.run", return_value=type("Result", (), {"returncode": 0})()), redirect_stdout(output):
            provisioning.provision(self.config, self.host, self.resources, apply, self.credentials, self.root)
        return output.getvalue()

    def test_preview_makes_no_provider_or_private_file_changes(self):
        output = self.run_provision(False)
        self.assertIn("Preview", output)
        self.assertFalse(self.host.root.exists())
        writes = [row for row in self.api.operations if row[1] != "GET" and "testIamPermissions" not in row[2]]
        self.assertEqual(writes, [])

    def test_repeated_apply_reuses_credentials_and_registration(self):
        self.run_provision()
        password = self.host.state()["databasePassword"]
        redis = (self.host.directory / "redis-password").read_bytes()
        key = self.host.key_file.read_bytes()
        output = self.run_provision()
        self.assertEqual(self.host.state()["databasePassword"], password)
        self.assertEqual((self.host.directory / "redis-password").read_bytes(), redis)
        self.assertEqual(self.host.key_file.read_bytes(), key)
        self.assertEqual(len(self.api.apps), 1)
        self.assertTrue(self.host.migrated)
        self.assertEqual(len([row for row in self.api.operations if row[2].endswith("/keys") and row[1] == "POST"]), 1)
        for canary in (password, redis.decode().strip(), "private-key-canary", "pull-token-canary"):
            self.assertNotIn(canary, output)
        patched = next(row[3] for row in self.api.operations if row[0] == "identitytoolkit" and row[1] == "PATCH")
        self.assertIn("existing.example.test", patched["authorizedDomains"])

    def test_interruption_after_credentials_resumes_without_rotating(self):
        self.host.fail_indexes = True
        with self.assertRaises(ValueError):
            self.run_provision()
        before = self.host.key_file.read_bytes(), self.host.state()["databasePassword"]
        self.host.fail_indexes = False
        self.run_provision()
        self.assertEqual(before, (self.host.key_file.read_bytes(), self.host.state()["databasePassword"]))

    def test_existing_user_without_local_credentials_requires_recovery(self):
        self.api.user = {"roles": [{"roleName": "readWrite", "databaseName": self.config['runtime']['MONGODB_DATABASE']}],
                         "scopes": [{"name": "shared", "type": "CLUSTER"}]}
        with self.assertRaisesRegex(ValueError, "without saved credentials"):
            self.run_provision()
        self.assertFalse(self.host.root.exists())

    def test_broad_database_user_is_rejected(self):
        self.api.user = {"roles": [{"roleName": "atlasAdmin", "databaseName": "admin"}]}
        with self.assertRaises(providers.ProviderError):
            self.run_provision()

    def test_identity_change_is_rejected_before_provider_mutation(self):
        self.run_provision()
        self.config["google"]["projectId"] = "other-project"
        before = len(self.api.operations)
        with self.assertRaisesRegex(ValueError, "identity changed"):
            self.run_provision()
        self.assertEqual(before, len(self.api.operations))

    def test_saved_firebase_key_cannot_select_another_project(self):
        self.run_provision()
        key = json.loads(self.host.key_file.read_text())
        key["project_id"] = "other-project"
        self.host.key_file.write_text(json.dumps(key))
        before = len(self.api.operations)
        with self.assertRaisesRegex(ValueError, "before provisioning"):
            self.run_provision()
        self.assertEqual(before, len(self.api.operations))

    def test_production_project_must_belong_to_this_app_and_parent(self):
        config = environment.load("production", self.root)
        resources = providers.Resources(FakeAPI(config), config, "unibase")
        with self.assertRaisesRegex(providers.ProviderError, "ownership conflict"):
            resources.preflight()

    def test_production_creation_is_scoped_and_reusable(self):
        config = environment.load("production", self.root)
        api = FakeAPI(config)
        api.project = None
        resources = providers.Resources(api, config, "unibase")
        host = FakeHost(config, "unibase", self.root / "private")
        with patch("provision.subprocess.run", return_value=type("Result", (), {"returncode": 0})()), redirect_stdout(io.StringIO()):
            provisioning.provision(config, host, resources, True, self.credentials, self.root)
            provisioning.provision(config, host, resources, True, self.credentials, self.root)
        creates = [row for row in api.operations if row[0] == "cloudresourcemanager" and row[1] == "POST" and row[2] == "v3/projects"]
        self.assertEqual(len(creates), 1)
        self.assertEqual(creates[0][3]["parent"], "folders/1234")
        self.assertEqual(creates[0][3]["labels"]["unibase-environment"], "production")

    def test_private_temporary_symlinks_are_rejected(self):
        target = self.root / "private-file"
        pending = self.root / "private-file.pending"
        victim = self.root / "victim"
        victim.write_text("retain-me")
        try:
            pending.symlink_to(victim)
        except OSError:
            self.skipTest("Symlink creation requires platform privileges")
        with self.assertRaises(ValueError):
            provisioning.private_write(target, "overwrite")
        self.assertEqual(victim.read_text(), "retain-me")

    def test_private_settings_and_cross_environment_identity_are_rejected(self):
        file = self.root / "deploy/environments/staging.json"
        config = copy.deepcopy(self.config)
        config["runtime"]["STRIPE_SECRET_KEY"] = "private-canary"
        file.write_text(json.dumps(config))
        with self.assertRaisesRegex(ValueError, "STRIPE_SECRET_KEY"):
            environment.load("staging", self.root)
        config = copy.deepcopy(self.config)
        config["deployment"]["port"] = json.loads((self.root / "deploy/environments/production.json").read_text())["deployment"]["port"]
        file.write_text(json.dumps(config))
        with self.assertRaisesRegex(ValueError, "collision"):
            environment.load("staging", self.root)

    def test_shared_owner_registration_matches_exact_application(self):
        registry = {"version": 1, **self.config["shared"], "applications": [{
            "repository": "fixture/unibase", "slug": "unibase", "environment": "staging",
            "hostname": "staging.example.test", "port": self.config["deployment"]["port"], "enabled": True}]}
        routes.validate_registry(registry, self.config, "fixture/unibase", "unibase")
        for change in ({"port": 3100}, {"repository": "other/app"}, {"environment": "production"}):
            bad = copy.deepcopy(registry)
            bad["applications"][0].update(change)
            with self.assertRaises(ValueError):
                routes.validate_registry(bad, self.config, "fixture/unibase", "unibase")

    def test_provider_error_does_not_disclose_request_or_response(self):
        from urllib.error import HTTPError
        api = providers.API({"GOOGLE_ACCESS_TOKEN": "private-canary", "ATLAS_CLIENT_ID": "", "ATLAS_CLIENT_SECRET": ""})
        with patch("providers.urlopen", side_effect=HTTPError("https://private-canary.test", 403, "private-canary", {}, io.BytesIO(b"private-canary"))):
            with self.assertRaises(providers.ProviderError) as caught:
                api.google("iam", "v1/private-canary")
        self.assertNotIn("private-canary", str(caught.exception))
