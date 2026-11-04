import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

MODULE = Path(__file__).resolve().parents[2] / "scripts/deploy/config.py"
spec = importlib.util.spec_from_file_location("deployment_config", MODULE)
config_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(config_module)

def fixture(root):
    manifest = json.loads((MODULE.parents[2] / "project.config.json").read_text())
    prefix = manifest["slug"].replace("-", "_")
    config = {"imageRepository": "ghcr.io/test/unibase"}
    for target, port in (("staging", 35101), ("production", 35102)):
        item = {"origin": f"https://{target}.example.test", "port": port,
                "firebaseProject": f"unibase-{target}-test", "mongoDatabase": f"{prefix}_{target}",
                "mongoUser": f"{prefix}_{target}"}
        item["redisImage"] = "redis@sha256:" + "b" * 64
        item["nginxImage"] = "nginx@sha256:" + "c" * 64
        item["ingressSubnet"] = "172.29.241.0/24" if target == "staging" else "172.29.242.0/24"
        config[target] = item
        directory = root / target
        directory.mkdir(parents=True, exist_ok=True)
        (directory / "redis-password").write_text("r" * 43)
        env = {"REDIS_URL": "redis://default:" + "r" * 43 + "@redis:6379", "APP_ENV": target, "APP_ORIGIN": item["origin"], "AUTH_MODE": "firebase",
               "FIREBASE_PROJECT_ID": item["firebaseProject"], "FIREBASE_API_KEY": "test-public-key",
               "FIREBASE_APP_ID": "test-public-app", "MONGODB_DATABASE": item["mongoDatabase"],
               "MONGODB_URI": f"mongodb+srv://{item['mongoUser']}:test-password@example.test"}
        (directory / "runtime.env").write_text("".join(f"{key}={value}\n" for key, value in env.items()))
        (directory / "firebase.json").write_text(json.dumps({"type": "service_account", "project_id": item["firebaseProject"], "private_key": "synthetic-fixture"}))
    (root / "config.json").write_text(json.dumps(config))
    return config


class ConfigTests(unittest.TestCase):
    def test_namespaced_extension_mcp_permissions(self):
        catalog = {"mcpPermissions": ["server:read"]}
        def values(permission):
            return {"MCP_ENABLED": "true", "MCP_TOKEN_FIXTURE": "x" * 43,
                    "MCP_CLIENTS_JSON": json.dumps([{"id": "fixture", "tokenEnv": "MCP_TOKEN_FIXTURE", "permissions": [permission]}])}
        config_module.validate_mcp(values("extension:booklets:write"), catalog)
        for invalid in ("extension:*:write", "extension:booklets:admin", "booklets:write"):
            with self.assertRaises(ValueError):
                config_module.validate_mcp(values(invalid), catalog)

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="unibase-deploy-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.config = fixture(self.root)

    def test_valid_isolated_inputs(self):
        for target in ("staging", "production"):
            values = config_module.validate(self.root, target)
            self.assertEqual(values[0], self.config[target]["origin"])
            self.assertNotIn("test-password", "".join(values))

    def test_appearance_presets(self):
        env = self.root / "staging/runtime.env"
        original = env.read_text()
        for style in ("classic", "glass", "soft-blue"):
            env.write_text(original + f"APP_STYLE={style}\n")
            config_module.validate(self.root, "staging")
        for style in ("", "unknown", "Glass"):
            env.write_text(original + f"APP_STYLE={style}\n")
            with self.assertRaises(ValueError):
                config_module.validate(self.root, "staging")

    def test_dify_bindings_are_private_and_validated(self):
        env = self.root / "staging/runtime.env"
        original = env.read_text()
        bindings = [{"id":"main","keyEnv":"DIFY_KEY_TEXT"}]
        extra = "DIFY_MODE=live\nDIFY_BASE_URL=https://dify.example.test/v1\nDIFY_ORCHESTRATORS_JSON=" + json.dumps(bindings) + "\nDIFY_KEY_TEXT=synthetic-private-key\n"
        env.write_text(original + extra)
        self.assertNotIn("synthetic-private-key", "".join(config_module.validate(self.root, "staging")))
        env.write_text(original + extra + "DIFY_CREDENTIAL_ENCRYPTION_KEY=" + "a" * 64 + "\n")
        config_module.validate(self.root, "staging")
        env.write_text(original + extra + "DIFY_CREDENTIAL_ENCRYPTION_KEY=invalid-canary\n")
        with self.assertRaises(ValueError):
            config_module.validate(self.root, "staging")
        for bad in (extra.replace("https://", "http://"), extra.replace("keyEnv", "invalidKeyRef"), extra.replace("DIFY_MODE=live", "DIFY_MODE=invalid")):
            env.write_text(original + bad)
            with self.assertRaises(ValueError):
                config_module.validate(self.root, "staging")

    def test_private_object_storage_settings_are_explicit_and_secret(self):
        env = self.root / "staging/runtime.env"
        original = env.read_text()
        settings = {"ASSET_STORE": "s3", "ASSET_S3_ENDPOINT": "https://objects.example.test",
                    "ASSET_S3_REGION": "us-east-1", "ASSET_S3_BUCKET": "private-assets",
                    "ASSET_S3_PREFIX": "run-assets", "ASSET_S3_ACCESS_KEY_ID": "fixture",
                    "ASSET_S3_SECRET_ACCESS_KEY": "fixture-secret", "ASSET_S3_FORCE_PATH_STYLE": "true"}
        def write(values):
            env.write_text(original + "".join(f"{key}={value}\n" for key, value in values.items()))
        write(settings)
        values = config_module.validate(self.root, "staging")
        self.assertNotIn("fixture-secret", "".join(values))
        for override in ({"ASSET_STORE": "unknown"}, {"ASSET_S3_ENDPOINT": "http://objects.example.test"},
                         {"ASSET_S3_ENDPOINT": "https://objects.example.test/path"}, {"ASSET_S3_SECRET_ACCESS_KEY": ""}):
            write({**settings, **override})
            with self.assertRaises(ValueError):
                config_module.validate(self.root, "staging")

    def test_each_shared_identity_is_rejected(self):
        for field in ("origin", "port", "firebaseProject", "mongoDatabase", "mongoUser"):
            with self.subTest(field=field):
                config = json.loads(json.dumps(self.config))
                config["staging"][field] = config["production"][field]
                (self.root / "config.json").write_text(json.dumps(config))
                with self.assertRaises(ValueError):
                    config_module.validate(self.root, "staging")

    def test_staging_cannot_use_production_runtime_or_credential(self):
        for filename in ("runtime.env", "firebase.json"):
            with self.subTest(filename=filename):
                fixture(self.root)
                (self.root / "staging" / filename).write_bytes((self.root / "production" / filename).read_bytes())
                with self.assertRaises(ValueError):
                    config_module.validate(self.root, "staging")

    def test_unknown_emulator_or_shell_code_setting_rejected(self):
        for extra in ("FIREBASE_AUTH_EMULATOR_HOST=localhost:9099", "PATH=/tmp/unsafe", "APP_ENV=production"):
            with self.subTest(extra=extra):
                fixture(self.root)
                with (self.root / "staging/runtime.env").open("a") as file:
                    file.write(extra + "\n")
                with self.assertRaises(ValueError):
                    config_module.validate(self.root, "staging")

    def test_atlas_user_must_match_selected_environment(self):
        env = self.root / "staging/runtime.env"
        env.write_text(env.read_text().replace(
            f"mongodb+srv://{self.config['staging']['mongoUser']}:",
            f"mongodb+srv://{self.config['production']['mongoUser']}:"))
        with self.assertRaises(ValueError):
            config_module.validate(self.root, "staging")

    def test_shared_tunnel_needs_no_environment_token(self):
        config_module.validate(self.root, "staging")
        self.assertFalse((self.root / "staging/tunnel-token").exists())

    def test_mcp_clients_hosts_and_run_selection(self):
        env = self.root / "staging/runtime.env"
        original = env.read_text()
        values = {
            "MCP_ENABLED": "true",
            "MCP_CLIENTS_JSON": json.dumps([{"id": "dify", "tokenEnv": "MCP_TOKEN_DIFY", "permissions": ["run:read", "artifact:write"]}]),
            "MCP_TOKEN_DIFY": "s" * 43,
            "MCP_ALLOWED_HOSTS_JSON": '["tools.example.test"]',
            "RUN_MCP_CLIENT_ID": "dify",
        }
        def write(extra):
            env.write_text(original + "".join(f"{k}={v}\n" for k, v in extra.items()))
        write(values)
        self.assertNotIn("s" * 43, "".join(config_module.validate(self.root, "staging")))
        for changes in ({"MCP_TOKEN_DIFY": "short"}, {"MCP_TOKEN_bad": "x" * 43},
                        {"RUN_MCP_CLIENT_ID": "missing"}, {"MCP_ALLOWED_HOSTS_JSON": '["*.example.test"]'},
                        {"MCP_ENABLED": "yes"},
                        {"MCP_CLIENTS_JSON": values["MCP_CLIENTS_JSON"].replace("artifact:write", "admin:all")}):
            write({**values, **changes})
            with self.assertRaises(ValueError):
                config_module.validate(self.root, "staging")

    def test_persona_completion_connection_validation(self):
        env = self.root / "staging/runtime.env"
        original = env.read_text()
        values = {"PERSONA_COMPLETION_MODE": "live", "PERSONA_COMPLETION_BASE_URL": "https://model.example.test/v1", "PERSONA_COMPLETION_API_KEY": "completion-secret-canary"}
        def write(extra):
            env.write_text(original + "".join(f"{key}={value}\n" for key, value in extra.items()))
        write(values)
        self.assertNotIn(values["PERSONA_COMPLETION_API_KEY"], "".join(config_module.validate(self.root, "staging")))
        for changes in ({"PERSONA_COMPLETION_MODE": "unknown"}, {"PERSONA_COMPLETION_API_KEY": ""},
                        {"PERSONA_COMPLETION_BASE_URL": "http://127.0.0.1/v1"},
                        {"PERSONA_COMPLETION_BASE_URL": "https://user:password@example.test/v1"},
                        {"PERSONA_COMPLETION_BASE_URL": "https://example.test/v1?token=private"}):
            write({**values, **changes})
            with self.assertRaises(ValueError) as caught:
                config_module.validate(self.root, "staging")
            self.assertNotIn("completion-secret-canary", str(caught.exception))
