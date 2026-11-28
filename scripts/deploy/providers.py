"""Bounded provider administration; errors never include provider bodies or URLs."""
import base64
import hashlib
import json
import time
from urllib.error import HTTPError
from urllib.parse import urlencode, quote
from urllib.request import Request, urlopen


class ProviderError(RuntimeError):
    pass


class API:
    def __init__(self, secrets):
        self.google_token = secrets["GOOGLE_ACCESS_TOKEN"]
        self.atlas_id = secrets["ATLAS_CLIENT_ID"]
        self.atlas_secret = secrets["ATLAS_CLIENT_SECRET"]
        self.atlas_token = None

    def request(self, method, url, body=None, headers=None, missing=False):
        data = None if body is None else body if isinstance(body, bytes) else json.dumps(body).encode()
        request = Request(url, data=data, method=method,
                          headers={"Content-Type": "application/json", **(headers or {})})
        try:
            with urlopen(request, timeout=30) as response:
                # Every endpoint here returns small control-plane JSON, not assets.
                payload = response.read(4 * 1024 * 1024 + 1)
                if len(payload) > 4 * 1024 * 1024:
                    raise ProviderError("Provider response exceeded its bound")
                return json.loads(payload) if payload else {}
        except HTTPError as error:
            if missing and error.code == 404:
                return None
            raise ProviderError(f"Provider request failed: HTTP {error.code}") from None
        except (OSError, ValueError):
            raise ProviderError("Provider request failed (details suppressed)") from None

    def google(self, service, path, method="GET", body=None, missing=False):
        try:
            return self.request(method, f"https://{service}.googleapis.com/{path}", body,
                                {"Authorization": "Bearer " + self.google_token}, missing)
        except ProviderError as error:
            raise ProviderError("Google " + service + ": " + str(error)) from None

    def atlas(self, path, method="GET", body=None, missing=False):
        if not self.atlas_token:
            basic = base64.b64encode(f"{self.atlas_id}:{self.atlas_secret}".encode()).decode()
            self.atlas_token = self.request("POST", "https://cloud.mongodb.com/api/oauth/token",
                                           b"grant_type=client_credentials",
                                           {"Authorization": "Basic " + basic, "Content-Type": "application/x-www-form-urlencoded"})["access_token"]
        return self.request(method, "https://cloud.mongodb.com/api/atlas/v2/" + path, body,
                            {"Authorization": "Bearer " + self.atlas_token,
                             "Accept": "application/vnd.atlas.2025-03-12+json"}, missing)

    def wait(self, service, operation, timeout=600):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            result = self.google(service, "v1" + ("beta1" if service == "firebase" else "") + "/" + operation)
            if result.get("done"):
                if "error" in result:
                    raise ProviderError("Provider operation failed (details suppressed)")
                return result.get("response", {})
            time.sleep(3)
        raise ProviderError("Provider operation timed out; inspect state before retrying")


class Resources:
    def __init__(self, api, config, slug):
        self.api, self.config, self.slug = api, config, slug
        self.env = config["environment"]
        self.project = config["google"]["projectId"]
        self.owner = hashlib.sha256(slug.encode()).hexdigest()[:24]
        self.account = "app-" + hashlib.sha256((slug + ":" + self.env).encode()).hexdigest()[:16] + "-auth"
        self.marker = f"{slug}:{self.env}"

    def preflight(self):
        project = self.api.google("cloudresourcemanager", "v3/projects/" + self.project, missing=True)
        if self.env == "staging" and project is None:
            raise ProviderError("Shared staging Firebase project does not exist")
        if project:
            if project.get("state") != "ACTIVE":
                raise ProviderError("Google project is not active")
            if self.env == "production" and (project.get("labels", {}).get("unibase-owner") != self.owner or
                                              project.get("labels", {}).get("unibase-environment") != self.env or
                                              project.get("parent") != self.config["google"]["parent"]):
                raise ProviderError("Production Google project ownership conflict")
            required = ["resourcemanager.projects.getIamPolicy", "resourcemanager.projects.setIamPolicy",
                        "serviceusage.services.enable", "iam.serviceAccounts.create", "iam.serviceAccountKeys.create",
                        "firebase.projects.update", "firebase.clients.create", "firebaseauth.configs.get", "firebaseauth.configs.update"]
            permissions = self.api.google("cloudresourcemanager", "v1/projects/" + self.project + ":testIamPermissions",
                                          "POST", {"permissions": required})
        else:
            parent = self.config["google"]["parent"]
            required = ["resourcemanager.projects.create"]
            permissions = self.api.google("cloudresourcemanager", "v3/" + parent + ":testIamPermissions",
                                          "POST", {"permissions": required})
        if not set(required).issubset(permissions.get("permissions", [])):
            raise ProviderError("Google provisioner lacks required permissions")
        atlas = self.config["atlas"]
        group = self.api.atlas("groups/" + atlas["projectId"])
        if group.get("id") != atlas["projectId"]:
            raise ProviderError("Atlas project mismatch")
        cluster = self.api.atlas(f"groups/{atlas['projectId']}/clusters/{quote(atlas['clusterName'], safe='')}")
        uri = cluster.get("connectionStrings", {}).get("standardSrv", "")
        if not uri.startswith("mongodb+srv://") or "@" in uri or cluster.get("stateName") != "IDLE":
            raise ProviderError("Existing Atlas cluster is unavailable")
        self.cluster_uri = uri
        user = self.api.atlas(f"groups/{atlas['projectId']}/databaseUsers/admin/{quote(atlas['mongoUser'], safe='')}", missing=True)
        self.validate_user(user)
        # Reading these resources also establishes scoped access before mutation.
        self.existing_access = []
        page = 1
        while True:
            access = self.api.atlas(f"groups/{atlas['projectId']}/accessList?itemsPerPage=100&pageNum={page}")
            self.existing_access.extend(access.get("results", []))
            if len(self.existing_access) >= access.get("totalCount", len(self.existing_access)):
                break
            if page >= 100:
                raise ProviderError("Atlas network registry exceeded its bound")
            page += 1
        return user

    def validate_user(self, user):
        if user is None:
            return
        expected = [{"roleName": "readWrite", "databaseName": self.config["runtime"]["MONGODB_DATABASE"]}]
        if user.get("roles") != expected or user.get("scopes") != [{"name": self.config["atlas"]["clusterName"], "type": "CLUSTER"}]:
            raise ProviderError("Existing Atlas database user ownership conflict")

    def firebase(self, save_key, saved_key=None, oauth_secret=None):
        project = self.api.google("cloudresourcemanager", "v3/projects/" + self.project, missing=True)
        if project is None:
            operation = self.api.google("cloudresourcemanager", "v3/projects", "POST", {
                "projectId": self.project, "displayName": self.slug + " production",
                "parent": self.config["google"]["parent"],
                "labels": {"unibase-owner": self.owner, "unibase-environment": self.env}})
            # Resource Manager operations use v3, unlike other provider operations.
            deadline = time.monotonic() + 600
            while time.monotonic() < deadline:
                result = self.api.google("cloudresourcemanager", "v3/" + operation["name"])
                if result.get("done"):
                    if result.get("error"):
                        raise ProviderError("Google project creation failed")
                    break
                time.sleep(3)
            else:
                raise ProviderError("Google project creation timed out")
        project = self.api.google("cloudresourcemanager", "v3/projects/" + self.project)
        number = project["name"].split("/")[-1]
        enabled = self.api.google("serviceusage", f"v1/projects/{number}/services:batchEnable", "POST", {
            "serviceIds": ["firebase.googleapis.com", "identitytoolkit.googleapis.com", "iam.googleapis.com"]})
        self.api.wait("serviceusage", enabled["name"])
        firebase = self.api.google("firebase", "v1beta1/projects/" + self.project, missing=True)
        if firebase is None:
            result = self.api.google("firebase", "v1beta1/projects/" + self.project + ":addFirebase", "POST", {})
            self.api.wait("firebase", result["name"])
        apps, token = [], None
        while True:
            result = self.api.google("firebase", f"v1beta1/projects/{self.project}/webApps?" + urlencode({"pageSize": 100, **({"pageToken": token} if token else {})}))
            apps.extend(result.get("apps", []))
            token = result.get("nextPageToken")
            if not token:
                break
            if len(apps) > 10000:
                raise ProviderError("Firebase app registry exceeded its bound")
        matches = [app for app in apps if app.get("displayName") == self.marker]
        if len(matches) > 1:
            raise ProviderError("Ambiguous Firebase web-app registration")
        if matches:
            app = matches[0]
        else:
            result = self.api.google("firebase", f"v1beta1/projects/{self.project}/webApps", "POST", {"displayName": self.marker})
            app = self.api.wait("firebase", result["name"])
        public = self.api.google("firebase", "v1beta1/" + app["name"] + "/config")
        auth = self.api.google("identitytoolkit", f"admin/v2/projects/{self.project}/config", missing=True)
        from urllib.parse import urlsplit
        host = urlsplit(self.config["runtime"]["APP_ORIGIN"]).hostname
        pending = []
        if auth is None:
            # The public initializeAuth API enables billing-only Identity Platform.
            # Firebase Authentication console initialization is a bootstrap task.
            pending.append("Initialize Firebase Authentication in its console, then rerun provisioning")
        else:
            domains = sorted(set(auth.get("authorizedDomains", []) + [host]))
            self.api.google("identitytoolkit", f"admin/v2/projects/{self.project}/config?updateMask=authorizedDomains,signIn.email.enabled,signIn.email.passwordRequired", "PATCH", {
                "authorizedDomains": domains, "signIn": {"email": {"enabled": True, "passwordRequired": True}}})
        email = self.account + "@" + self.project + ".iam.gserviceaccount.com"
        name = f"projects/{self.project}/serviceAccounts/{email}"
        account = self.api.google("iam", "v1/" + name, missing=True)
        if account is None:
            self.api.google("iam", f"v1/projects/{self.project}/serviceAccounts", "POST", {
                "accountId": self.account, "serviceAccount": {"displayName": self.marker}})
        elif account.get("displayName") != self.marker:
            raise ProviderError("Firebase service-account ownership conflict")
        policy = self.api.google("cloudresourcemanager", f"v1/projects/{self.project}:getIamPolicy", "POST", {"options": {"requestedPolicyVersion": 3}})
        bindings = policy.setdefault("bindings", [])
        role = next((entry for entry in bindings if entry["role"] == "roles/firebaseauth.admin" and "condition" not in entry), None)
        if role is None:
            role = {"role": "roles/firebaseauth.admin", "members": []}
            bindings.append(role)
        if "serviceAccount:" + email not in role["members"]:
            role["members"].append("serviceAccount:" + email)
            self.api.google("cloudresourcemanager", f"v1/projects/{self.project}:setIamPolicy", "POST", {"policy": policy})
        if saved_key:
            if saved_key.get("project_id") != self.project or saved_key.get("client_email") != email:
                raise ProviderError("Saved Firebase credential ownership conflict")
            existing_key = self.api.google("iam", "v1/" + name + "/keys/" + saved_key["private_key_id"])
            if existing_key.get("disabled"):
                raise ProviderError("Saved Firebase key is disabled; operator recovery required")
        else:
            existing = self.api.google("iam", "v1/" + name + "/keys?keyTypes=USER_MANAGED")
            if existing.get("keys"):
                raise ProviderError("Firebase key exists without its private file; operator recovery required")
            key = self.api.google("iam", "v1/" + name + "/keys", "POST", {"privateKeyType": "TYPE_GOOGLE_CREDENTIALS_FILE"})
            save_key(json.loads(base64.b64decode(key["privateKeyData"])))
        google = self.api.google("identitytoolkit", f"admin/v2/projects/{self.project}/defaultSupportedIdpConfigs/google.com", missing=True) if auth else None
        client_id = self.config["google"].get("oauthClientId")
        if auth and client_id and oauth_secret and not (google and google.get("enabled")):
            body = {"enabled": True, "clientId": client_id, "clientSecret": oauth_secret}
            if google is None:
                self.api.google("identitytoolkit", f"admin/v2/projects/{self.project}/defaultSupportedIdpConfigs?idpId=google.com", "POST", body)
            else:
                self.api.google("identitytoolkit", f"admin/v2/projects/{self.project}/defaultSupportedIdpConfigs/google.com?updateMask=enabled,clientId,clientSecret", "PATCH", body)
        elif not google or not google.get("enabled"):
            pending.append("Configure Google OAuth consent/client and provider; add the app hostname to Firebase authorized domains (popup sign-in needs no per-host OAuth origin/redirect; a custom OAuth client needs https://<project>.firebaseapp.com/__/auth/handler)")
        return {"FIREBASE_API_KEY": public["apiKey"], "FIREBASE_APP_ID": public["appId"]}, pending

    def database(self, password, existing):
        atlas = self.config["atlas"]
        if existing is None:
            self.api.atlas(f"groups/{atlas['projectId']}/databaseUsers", "POST", {
                "databaseName": "admin", "username": atlas["mongoUser"], "password": password,
                "roles": [{"roleName": "readWrite", "databaseName": self.config["runtime"]["MONGODB_DATABASE"]}],
                "scopes": [{"name": atlas["clusterName"], "type": "CLUSTER"}]})
        # Add one exact entry; never replace or broaden an existing allowlist.
        from ipaddress import ip_network
        wanted = ip_network(atlas["vpsEgressCidr"])
        if not any(ip_network(entry.get("cidrBlock") or entry["ipAddress"]) == wanted for entry in self.existing_access):
            self.api.atlas(f"groups/{atlas['projectId']}/accessList", "POST", [{
                "cidrBlock": atlas["vpsEgressCidr"], "comment": self.marker}])
        return self.cluster_uri.replace("mongodb+srv://", "mongodb+srv://" + quote(atlas["mongoUser"], safe="") + ":" + quote(password, safe="") + "@", 1)
