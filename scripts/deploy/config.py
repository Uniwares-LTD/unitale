"""Validate fixed Unibase host inputs without evaluating env files as shell code."""
import json
import re
import sys
from ipaddress import ip_network
from pathlib import Path
from urllib.parse import urlsplit, unquote
from uuid import UUID


def validate_mcp(env, catalog):
    enabled = env.get("MCP_ENABLED", "false")
    if enabled not in ("true", "false"):
        raise ValueError("Invalid MCP configuration")
    client_id = env.get("RUN_MCP_CLIENT_ID", "dify")
    if not re.fullmatch(r"[a-z][a-z0-9-]{0,63}", client_id):
        raise ValueError("Invalid Run MCP client selection")
    if enabled == "false":
        return
    clients = json.loads(env.get("MCP_CLIENTS_JSON", ""))
    hosts = json.loads(env.get("MCP_ALLOWED_HOSTS_JSON", "[]"))
    if not isinstance(hosts, list) or len(hosts) > 16:
        raise ValueError("Invalid MCP hosts")
    for host in hosts:
        if not isinstance(host, str) or not re.fullmatch(r"[a-zA-Z0-9.\-\[\]:]+", host):
            raise ValueError("Invalid MCP host")
        url = urlsplit("https://" + host)
        canonical = ("[" + url.hostname + "]") if url.hostname and ":" in url.hostname else url.hostname
        if url.port is not None and url.port != 443:
            canonical = f"{canonical}:{url.port}"
        if not url.hostname or url.path or url.query or url.fragment or canonical != host.lower():
            raise ValueError("Invalid MCP host")
    if not isinstance(clients, list) or not 1 <= len(clients) <= 32:
        raise ValueError("Invalid MCP clients")
    ids, tokens = set(), set()
    for client in clients:
        if (not isinstance(client, dict) or set(client) != {"id", "tokenEnv", "permissions"} or
                not re.fullmatch(r"[a-z][a-z0-9-]{0,63}", client.get("id", "")) or
                not re.fullmatch(r"MCP_TOKEN_[A-Z0-9_]+", client.get("tokenEnv", ""))):
            raise ValueError("Invalid MCP client")
        permissions = client["permissions"]
        token = env.get(client["tokenEnv"], "")
        if (not isinstance(permissions, list) or not permissions or
                any(not isinstance(p, str) or (p not in catalog["mcpPermissions"] and not re.fullmatch(r"extension:[a-z][a-z0-9-]{1,39}:(read|write)", p)) for p in permissions) or
                not re.fullmatch(r"[A-Za-z0-9_-]{43,256}", token) or
                client["id"] in ids or token in tokens):
            raise ValueError("Invalid MCP client configuration")
        ids.add(client["id"])
        tokens.add(token)
    if "RUN_MCP_CLIENT_ID" in env and client_id not in ids:
        raise ValueError("Run MCP client is not registered")


def validate(root, target, runtime_file=None):
    manifest = json.loads((Path(__file__).resolve().parents[2] / "project.config.json").read_text())
    slug = manifest["slug"]
    if not re.fullmatch(r"[a-z][a-z0-9-]{2,39}", slug):
        raise ValueError("Invalid project identity")
    prefix = slug.replace("-", "_")
    config = json.loads((root / "config.json").read_text())
    if not re.fullmatch(r"ghcr.io/[a-z0-9_.-]+/[a-z0-9_.-]+", config["imageRepository"]):
        raise ValueError("Invalid Unibase image repository")
    fields = ("origin", "port", "firebaseProject", "mongoDatabase", "mongoUser")
    for key in fields:
        if config["staging"].get(key) is not None and config["staging"].get(key) == config["production"].get(key):
            raise ValueError("Environment identities must be distinct")
    for name in (target,):
        item = config[name]
        url = urlsplit(item["origin"])
        if (url.scheme != "https" or not url.hostname or url.username or
                item["origin"] != "https://" + url.hostname or url.query or url.fragment or
                url.hostname.endswith(".invalid")):
            raise ValueError("Invalid application origin")
        if type(item["port"]) is not int or not 1024 <= item["port"] <= 65535:
            raise ValueError("Invalid application port")
        if not re.fullmatch(r"[a-z][a-z0-9-]{4,28}[a-z0-9]", item["firebaseProject"]):
            raise ValueError("Invalid Firebase project")
        if not re.fullmatch(re.escape(prefix) + r"_[A-Za-z0-9_]+", item["mongoDatabase"]):
            raise ValueError("Database must be Unibase-specific")
        if not re.fullmatch(re.escape(prefix) + r"_[A-Za-z0-9_]+", item["mongoUser"]):
            raise ValueError("Database user must be Unibase-specific")
    for name in (target,):
        for key, image in (("redisImage", "redis"), ("nginxImage", "nginx")):
            if not re.fullmatch(image + r"@sha256:[a-f0-9]{64}", config[name].get(key, "")):
                raise ValueError("Infrastructure images must use digests")
    networks = []
    for name in ("staging", "production"):
        if not config[name].get("ingressSubnet"):
            continue
        network = ip_network(config[name]["ingressSubnet"])
        if network.version != 4 or not network.subnet_of(ip_network("172.16.0.0/12")) or not 24 <= network.prefixlen <= 28:
            raise ValueError("Invalid isolated ingress subnet")
        networks.append(network)
    if len(networks) == 2 and networks[0].overlaps(networks[1]):
        raise ValueError("Ingress networks must be distinct")
    item = config[target]
    directory = root / target
    env = {}
    catalog = json.loads((Path(__file__).parent / "environment-catalog.json").read_text())
    allowed = set(catalog["runtime"])
    for line in (runtime_file or directory / "runtime.env").read_text().splitlines():
        if not line or line.startswith("#"):
            continue
        key, value = line.split("=", 1)
        if (key not in allowed and not any(re.fullmatch(pattern, key) for pattern in catalog["credentialPatterns"])) or key in env:
            raise ValueError("Unknown or duplicate runtime setting")
        env[key] = value
    validate_mcp(env, catalog)
    diagnostics = env.get('DIAGNOSTICS_ENABLED', 'false')
    if diagnostics not in ('true', 'false') or (target == 'production' and diagnostics == 'true'):
        raise ValueError('Invalid diagnostics configuration')
    redis = urlsplit(env.get("REDIS_URL", ""))
    redis_password = (directory / "redis-password").read_text().strip()
    if (redis.scheme != "redis" or redis.hostname != "redis" or redis.port != 6379 or
            redis.username not in ("default", None, "") or
            unquote(redis.password or "") != redis_password or
            not re.fullmatch(r"[A-Za-z0-9_-]{43,256}", redis_password) or
            redis.path not in ("", "/0") or redis.query or redis.fragment):
        raise ValueError("Invalid private Redis configuration")
    limits = json.loads(env.get("RATE_LIMITS_JSON", "{}"))
    if not isinstance(limits, dict) or any(k not in ("read", "mutation", "upload", "admission", "mcp") or
        type(v) is not int or not 1 <= v <= 100000 for k, v in limits.items()):
        raise ValueError("Invalid request limits")

    # Deployment allowlist mirrors src/lib/design-styles.ts.
    if env.get("APP_STYLE", "classic") not in ("classic", "glass", "soft-blue"):
        raise ValueError("Invalid APP_STYLE")
    if env.get("ASSET_STORE", "mongo") not in ("mongo", "s3"):
        raise ValueError("Invalid ASSET_STORE")
    if env.get("ASSET_STORE") == "s3":
        asset_url = urlsplit(env.get("ASSET_S3_ENDPOINT", ""))
        if (asset_url.scheme != "https" or not asset_url.hostname or asset_url.username or
                asset_url.password or asset_url.query or asset_url.fragment or asset_url.path not in ("", "/")):
            raise ValueError("Invalid asset storage endpoint")
        for required in ("ASSET_S3_REGION", "ASSET_S3_BUCKET", "ASSET_S3_ACCESS_KEY_ID", "ASSET_S3_SECRET_ACCESS_KEY"):
            if not env.get(required):
                raise ValueError("Incomplete private asset storage configuration")
    mode = env.get("DIFY_MODE", "disabled")
    if mode not in ("disabled", "fake", "live"):
        raise ValueError("Invalid Dify mode")
    if mode == "live":
        if env.get("DIFY_CREDENTIAL_ENCRYPTION_KEY") and not re.fullmatch(r"[a-fA-F0-9]{64}",env["DIFY_CREDENTIAL_ENCRYPTION_KEY"]):
            raise ValueError("Invalid Dify credential encryption secret")
        dify_url = urlsplit(env.get("DIFY_BASE_URL", ""))
        if (dify_url.scheme != "https" or not dify_url.hostname or dify_url.username or
                dify_url.password or dify_url.query or dify_url.fragment or
                not re.fullmatch(r"/(?:[A-Za-z0-9_-]+/)*v1/?", dify_url.path)):
            raise ValueError("Invalid Dify API URL")
        definitions=json.loads(env.get("DIFY_ORCHESTRATORS_JSON", "[]"))
        if not isinstance(definitions,list) or len(definitions)>100:
            raise ValueError("Invalid orchestrator registrations")
        names=set()
        for definition in definitions:
            if not isinstance(definition,dict) or not re.fullmatch(r"[a-z][a-z0-9-]{0,63}",definition.get("id","")) or definition["id"] in names:
                raise ValueError("Invalid orchestrator registration")
            names.add(definition["id"])
            if not re.fullmatch(r"DIFY_KEY_[A-Z0-9_]+",definition.get("keyEnv","")):
                raise ValueError("Invalid execution credential reference")
            if "workflowId" in definition: UUID(definition["workflowId"])
        if env.get("DIFY_MANAGEMENT_KEY"):
            UUID(env.get("DIFY_WORKSPACE_ID",""))
            console=urlsplit(env.get("DIFY_CONSOLE_URL",""))
            if console.scheme!="https" or console.netloc!=dify_url.netloc or console.path!="/console/api" or console.query or console.fragment:
                raise ValueError("Invalid management connection")
    completion_mode = env.get("PERSONA_COMPLETION_MODE", "disabled")
    if completion_mode not in ("disabled", "fake", "live"):
        raise ValueError("Invalid Persona completion mode")
    if completion_mode == "live":
        completion_url = urlsplit(env.get("PERSONA_COMPLETION_BASE_URL", ""))
        if (completion_url.scheme != "https" or not completion_url.hostname or completion_url.username or
                completion_url.password or completion_url.query or completion_url.fragment):
            raise ValueError("Invalid Persona completion API URL")
        if not env.get("PERSONA_COMPLETION_API_KEY") or any(c in env["PERSONA_COMPLETION_API_KEY"] for c in "\r\n"):
            raise ValueError("Missing or invalid Persona completion API key")
    expected = {"APP_ENV": target, "APP_ORIGIN": item["origin"], "AUTH_MODE": "firebase",
                "FIREBASE_PROJECT_ID": item["firebaseProject"],
                "MONGODB_DATABASE": item["mongoDatabase"]}
    if any(env.get(k) != v for k, v in expected.items()):
        raise ValueError("Runtime environment identity mismatch")
    if not env.get("FIREBASE_API_KEY") or not env.get("FIREBASE_APP_ID"):
        raise ValueError("Missing Firebase browser identifiers")
    mongo = urlsplit(env["MONGODB_URI"])
    if (mongo.scheme != "mongodb+srv" or not mongo.hostname or not mongo.password or
            unquote(mongo.username or "") != item["mongoUser"]):
        raise ValueError("Scoped Atlas credentials required")
    credential = json.loads((directory / "firebase.json").read_text())
    if (credential.get("project_id") != item["firebaseProject"] or
            credential.get("type") != "service_account" or not credential.get("private_key")):
        raise ValueError("Firebase credential project mismatch")
    # Output only non-secret, validated Compose inputs, one value per line.
    return [item["origin"], str(item["port"]), "shared-tunnel", config["imageRepository"], item["redisImage"], item["nginxImage"], item["ingressSubnet"]]


if __name__ == "__main__":
    try:
        print("\n".join(validate(Path(sys.argv[1]), sys.argv[2], Path(sys.argv[3]) if len(sys.argv) == 4 else None)))
    except Exception:
        sys.exit("Invalid Unibase deployment configuration (values suppressed)")
