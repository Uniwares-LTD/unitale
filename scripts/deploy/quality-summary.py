"""Read the independent advisory artifact when available; never gate a release."""
import io
import json
import os
import subprocess
import zipfile

# The original validator wrote this array once, after its final check.
LEGACY_CHECKS = """check:env check:skills handbook:ready handbook:entrypoints
test:handbook check:docs check:template check:samples check:i18n typecheck lint
format:check test test:accounts test:deployment audit:quality check:workflows check:shell""".split()


def api(endpoint, binary=False):
    result = subprocess.run(["gh", "api", endpoint], capture_output=True, timeout=20, check=True)
    return result.stdout if binary else json.loads(result.stdout)


def summary(results):
    if not results:
        return "Built successfully; advisory quality results are pending or unavailable."
    if any(item.get("exitCode") != 0 for item in results):
        return "Built successfully with quality warnings. Inspect the independent advisory artifact."
    return "Built successfully; all reported advisory checks passed."


def release_summary(repo, commit):
    """Use completed manual evidence for this commit, or identify its merged PR."""
    try:
        runs = api(f"repos/{repo}/actions/workflows/validate.yml/runs?event=workflow_dispatch&head_sha={commit}&per_page=10")
        for run in runs["workflow_runs"]:
            if run["head_sha"] != commit or run["status"] != "completed" or run.get("conclusion") != "success":
                continue
            try:
                artifacts = api(f"repos/{repo}/actions/runs/{run['id']}/artifacts")["artifacts"]
                artifact = next(a for a in artifacts if a["name"] == f"quality-{commit}" and not a["expired"])
                data = api(f"repos/{repo}/actions/artifacts/{artifact['id']}/zip", binary=True)
                with zipfile.ZipFile(io.BytesIO(data)) as archive:
                    results = json.loads(archive.read("results.json"))
                    if not isinstance(results, list) or not all(isinstance(row, dict) for row in results):
                        continue
                    if "run.json" not in archive.namelist():
                        if [row.get("name") for row in results] == LEGACY_CHECKS:
                            return summary(results)
                        continue
                    meta = json.loads(archive.read("run.json"))
                    if (meta.get("head") == commit and meta.get("complete") is True
                            and meta.get("local") is False and meta.get("mode") == "full"):
                        return summary(results)
            except (StopIteration, KeyError, ValueError, OSError, zipfile.BadZipFile, subprocess.SubprocessError):
                continue
    except (KeyError, ValueError, OSError, subprocess.SubprocessError):
        pass
    try:
        prs = api(f"repos/{repo}/commits/{commit}/pulls")
        for pr in prs:
            if pr.get("merge_commit_sha") == commit and pr.get("merged_at"):
                return f"Built successfully. See PR #{int(pr['number'])} for local verification: https://github.com/{repo}/pull/{int(pr['number'])}. No hosted quality result was verified for this commit."
    except (KeyError, ValueError, OSError, subprocess.SubprocessError):
        pass
    return summary(None)


if __name__ == "__main__":
    with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf8") as report:
        report.write(release_summary(os.environ["GITHUB_REPOSITORY"], os.environ["GITHUB_SHA"]) + "\n")
