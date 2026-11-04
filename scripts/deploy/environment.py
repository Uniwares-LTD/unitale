"""Tracked public configuration. Credentials never belong in these documents."""
import json
import re
import sys
from pathlib import Path
from ipaddress import ip_network
from urllib.parse import urlsplit
from release_settings import settings_for

ROOT = Path(__file__).resolve().parents[2]
SECRET_KEYS = {
    "PLAY_BILLING_SERVICE_ACCOUNT_JSON", "MONGODB_URI", "REDIS_URL", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
    "DIFY_MANAGEMENT_KEY", "DIFY_CREDENTIAL_ENCRYPTION_KEY", "PERSONA_COMPLETION_API_KEY",
    "ASSET_S3_ACCESS_KEY_ID", "ASSET_S3_SECRET_ACCESS_KEY",
}


def load(target, root=ROOT, require_connections=True):
    target = "production" if target == "prod" else target
    if target not in ("local", "staging", "production"):
        raise ValueError("Invalid environment selection")
    config = json.loads((root / "deploy/environments" / (target + ".json")).read_text())
    manifest = json.loads((root / "project.config.json").read_text())
    catalog = json.loads((root / "scripts/deploy/environment-catalog.json").read_text())
    if config.get("version") != 1 or config.get("environment") != target:
        raise ValueError("Environment document mismatch")
    sections = {
        "deployment": {"imageRepository", "port", "ingressSubnet", "redisImage", "nginxImage", "adminImage"},
        "ssh": {"host", "user", "transport", "cloudflaredVersion", "cloudflaredSha256"},
        "google": {"projectId", "parent", "workloadIdentityProvider", "provisionerServiceAccount", "oauthClientId"},
        "atlas": {"projectId", "clusterName", "mongoUser", "vpsEgressCidr"},
        "shared": {"ownerRepository", "ownerRef", "routeWorkflow", "routeMode", "tunnelId", "cloudflareAccountId", "cloudflareZoneId"},
        "ghcr": {"pullUser"}, "android": {"host", "packageName"},
    }
    if set(config) - {"version", "environment", "runtime", *sections}:
        raise ValueError("Unknown environment section")
    for section, keys in sections.items():
        if set(config.get(section, {})) - keys:
            raise ValueError("Unknown public setting in section: " + section)
    runtime = config["runtime"]
    allowed = set(catalog["runtime"] + (catalog["localOnly"] if target == "local" else []))
    for key, value in runtime.items():
        if key not in allowed or (key in SECRET_KEYS and not (target == "local" and key == "MONGODB_URI")):
            raise ValueError("Private or unknown tracked runtime setting: " + key)
        if value is not None and (not isinstance(value, str) or any(c in value for c in "\r\n\0")):
            raise ValueError("Invalid tracked runtime setting: " + key)
    if runtime.get("APP_ENV") != target:
        raise ValueError("Runtime environment mismatch")
    settings_for(config)
    prefix = manifest["slug"].replace("-", "_") + "_"
    if not re.fullmatch(r"[A-Za-z0-9_]{1,64}", runtime.get("MONGODB_DATABASE") or "") or not runtime["MONGODB_DATABASE"].startswith(prefix):
        raise ValueError("Database identity must use the project prefix")
    if target == "local":
        if runtime.get("AUTH_MODE") != "emulator" or runtime.get("FIREBASE_PROJECT_ID") != "demo-" + manifest["slug"]:
            raise ValueError("Invalid local identity")
        uri = urlsplit(runtime.get("MONGODB_URI") or "mongodb://127.0.0.1:27017")
        if uri.scheme != "mongodb" or uri.hostname not in ("localhost", "127.0.0.1", "::1") or uri.username or uri.password:
            raise ValueError("Tracked local MongoDB must be credential-free and loopback-only")
        return config
    if runtime.get("AUTH_MODE") != "firebase":
        raise ValueError("Live environments require Firebase")
    route_mode = config["shared"].get("routeMode") or "registry"
    if route_mode not in ("registry", "owner-managed"):
        raise ValueError("Invalid route mode for this environment")
    owner_managed = route_mode == "owner-managed"
    required_sections = {
        "runtime": ["APP_ORIGIN", "FIREBASE_PROJECT_ID"],
        "deployment": ["imageRepository", "port", "ingressSubnet", "redisImage", "nginxImage", "adminImage"],
        "ssh": ["host", "user", "cloudflaredVersion", "cloudflaredSha256"],
        "google": ["projectId", "workloadIdentityProvider", "provisionerServiceAccount"],
        "atlas": ["projectId", "clusterName", "mongoUser", "vpsEgressCidr"],
        "shared": ["ownerRepository", "ownerRef", "routeWorkflow", "tunnelId", "cloudflareAccountId", "cloudflareZoneId"],
        "ghcr": [],
    }
    transport = config["ssh"].get("transport") or "cloudflare"
    if transport not in ("direct", "cloudflare"):
        raise ValueError("Invalid SSH transport")
    if transport == "direct":
        required_sections["ssh"] = ["host", "user"]
    if owner_managed:
        required_sections["google"] = ["projectId"]
        required_sections["shared"] = ["ownerRepository", "ownerRef", "tunnelId", "cloudflareAccountId", "cloudflareZoneId"]
        required_sections["ghcr"] = []
    missing = []
    for section, keys in required_sections.items():
        for key in keys:
            value = config[section].get(key)
            if require_connections and (value is None or value == ""):
                missing.append(section + "." + key)
            if isinstance(value, str) and any(c in value for c in "\r\n\0"):
                raise ValueError("Invalid public configuration: " + section + "." + key)
    if missing:
        raise ValueError("Missing public configuration: " + ", ".join(missing))
    if not require_connections:
        return config
    origin = urlsplit(runtime.get("APP_ORIGIN") or "")
    if origin.scheme != "https" or not origin.hostname or runtime["APP_ORIGIN"] != "https://" + origin.hostname:
        raise ValueError("Canonical HTTPS origin required")
    if runtime.get("FIREBASE_PROJECT_ID") != config["google"]["projectId"]:
        raise ValueError("Firebase identities must match")
    if not re.fullmatch(r"[a-z][a-z0-9-]{4,28}[a-z0-9]", config["google"]["projectId"]):
        raise ValueError("Invalid Firebase project identity")
    if target == "production" and not re.fullmatch(r"(?:organizations|folders)/[0-9]+", config["google"].get("parent") or ""):
        raise ValueError("Production requires an explicit Google project parent")
    deployment = config["deployment"]
    if not re.fullmatch(r"ghcr.io/[a-z0-9_.-]+/[a-z0-9_.-]+", deployment["imageRepository"]):
        raise ValueError("Invalid image repository")
    if type(deployment["port"]) is not int or not 1024 <= deployment["port"] <= 65535:
        raise ValueError("Invalid loopback port")
    network = ip_network(deployment["ingressSubnet"])
    if network.version != 4 or not network.subnet_of(ip_network("172.16.0.0/12")) or not 24 <= network.prefixlen <= 28:
        raise ValueError("Invalid private bridge subnet")
    for key, image in (("redisImage", "redis"), ("nginxImage", "nginx"), ("adminImage", "node")):
        if not re.fullmatch(image + r"@sha256:[a-f0-9]{64}", deployment[key]):
            raise ValueError("Pinned infrastructure image required: " + key)
    ssh = config["ssh"]
    for key, pattern in (("host", r"[a-zA-Z0-9.-]+"), ("user", r"[a-z_][a-z0-9_-]*"),
                         ("cloudflaredVersion", r"[0-9]+\.[0-9]+\.[0-9]+"), ("cloudflaredSha256", r"[a-f0-9]{64}")):
        if transport == "direct" and key.startswith("cloudflared"):
            continue
        if not re.fullmatch(pattern, ssh[key]):
            raise ValueError("Invalid SSH configuration: " + key)
    if not re.fullmatch(re.escape(prefix) + r"[A-Za-z0-9_]+", config["atlas"]["mongoUser"]):
        raise ValueError("Database user identity must use the project prefix")
    if not re.fullmatch(r"[a-f0-9]{24}", config["atlas"]["projectId"]) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9-]{0,63}", config["atlas"]["clusterName"]):
        raise ValueError("Invalid Atlas project or cluster identity")
    from uuid import UUID
    if str(UUID(config["shared"]["tunnelId"])) != config["shared"]["tunnelId"]:
        raise ValueError("Invalid existing shared tunnel identity")
    for key in ("cloudflareAccountId", "cloudflareZoneId"):
        if not re.fullmatch(r"[a-f0-9]{32}", config["shared"][key]):
            raise ValueError("Invalid public Cloudflare identity: " + key)
    address = ip_network(config["atlas"]["vpsEgressCidr"])
    if address.prefixlen != address.max_prefixlen:
        raise ValueError("Atlas network access must select one exact VPS IP")
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", config["shared"]["ownerRepository"]):
        raise ValueError("Invalid shared owner repository")
    other = "production" if target == "staging" else "staging"
    peer = load(other, root, False)
    if peer["deployment"]["imageRepository"] and peer["deployment"]["imageRepository"] != deployment["imageRepository"]:
        raise ValueError("Both environments must use the same image repository")
    for section, key in (("runtime", "APP_ORIGIN"), ("runtime", "MONGODB_DATABASE"),
                         ("google", "projectId"), ("atlas", "mongoUser"), ("deployment", "port")):
        if config[section][key] == peer[section].get(key):
            raise ValueError("Environment identity collision: " + key)
    if ip_network(peer["deployment"]["ingressSubnet"]).overlaps(network):
        raise ValueError("Environment bridge networks overlap")
    return config


def exports(config):
    ssh = config["ssh"]
    return {"VPS_HOST": ssh["host"], "VPS_USER": ssh["user"],
            "SSH_TRANSPORT": ssh.get("transport") or "cloudflare",
            "CLOUDFLARED_VERSION": ssh["cloudflaredVersion"], "CLOUDFLARED_SHA256": ssh["cloudflaredSha256"],
            "GOOGLE_WIF_PROVIDER": config["google"]["workloadIdentityProvider"],
            "GOOGLE_PROVISIONER_SERVICE_ACCOUNT": config["google"]["provisionerServiceAccount"]}


if __name__ == "__main__":
    try:
        android = len(sys.argv) == 3 and sys.argv[2] == "--android-env"
        config = load(sys.argv[1], require_connections=not android)
        import os
        if not android and os.environ.get("GITHUB_REPOSITORY") and config["deployment"]["imageRepository"] != "ghcr.io/" + os.environ["GITHUB_REPOSITORY"].lower():
            raise ValueError("Image repository must match the workflow repository")
        values = {"ANDROID_HOST": config["android"]["host"], "ANDROID_PACKAGE_NAME": config["android"]["packageName"]} if android else exports(config)
        if android:
            if not re.fullmatch(r"[a-z0-9.-]+", values["ANDROID_HOST"] or "") or not re.fullmatch(r"[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+", values["ANDROID_PACKAGE_NAME"] or ""):
                raise ValueError("Missing or invalid Android configuration")
        if len(sys.argv) == 3 and sys.argv[2] in ("--github-env", "--android-env"):
            with open(os.environ["GITHUB_ENV"], "a") as file:
                file.writelines(f"{key}={value or ''}\n" for key, value in values.items())
        else:
            print(json.dumps(config))
    except Exception as error:
        # Validation errors contain names only; provider payloads are never printed.
        print(str(error) if isinstance(error, ValueError) else "Invalid environment configuration", file=sys.stderr)
        sys.exit(1)
