"""Release summaries distinguish hosted verification from PR evidence."""
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch
import zipfile

spec = importlib.util.spec_from_file_location("quality_summary", Path(__file__).resolve().parents[2] / "scripts/deploy/quality-summary.py")
quality = importlib.util.module_from_spec(spec)
spec.loader.exec_module(quality)
SHA = "a" * 40


class QualityEvidenceTests(unittest.TestCase):
    def test_legacy_full_array_and_incomplete_new_artifact(self):
        rows = [dict(name=name, exitCode=0) for name in quality.LEGACY_CHECKS]
        for meta, result_rows, accepted in (
            (None, rows, True), (None, rows[:-1], False),
            (dict(head=SHA, local=False, complete=False, mode="full"), rows, False),
            (dict(head="b"*40, local=False, complete=True, mode="full"), rows, False),
        ):
            with self.subTest(meta=meta, length=len(result_rows)):
                data = io.BytesIO()
                with zipfile.ZipFile(data, "w") as archive:
                    if meta is not None:
                        archive.writestr("run.json", json.dumps(meta))
                    archive.writestr("results.json", json.dumps(result_rows))
                responses = [
                    {"workflow_runs": [dict(id=1, head_sha=SHA, status="completed", conclusion="success")]},
                    {"artifacts": [dict(id=2, name="quality-" + SHA, expired=False)]},
                    data.getvalue(), [],
                ]
                with patch.object(quality, "api", side_effect=responses):
                    self.assertEqual("checks passed" in quality.release_summary("org/repo", SHA), accepted)

    def test_searches_past_missing_artifact_for_exact_complete_run(self):
        def api(url, binary=False):
            if "workflows/" in url:
                return {"workflow_runs": [dict(id=i, head_sha=SHA, status="completed", conclusion="success") for i in [1, 2]]}
            if "runs/1/" in url:
                return {"artifacts": []}
            if "runs/2/" in url:
                return {"artifacts": [dict(id=3, name="quality-" + SHA, expired=False)]}
            self.assertTrue(binary)
            result = io.BytesIO()
            with zipfile.ZipFile(result, "w") as archive:
                archive.writestr("run.json", json.dumps(dict(head=SHA, local=False, complete=True, mode="full")))
                archive.writestr("results.json", json.dumps([dict(exitCode=0)]))
            return result.getvalue()
        with patch.object(quality, "api", api):
            self.assertIn("all reported advisory checks passed", quality.release_summary("org/repo", SHA))

    def test_only_links_pr_for_matching_merged_commit(self):
        for match in [True, False]:
            with self.subTest(match=match), patch.object(quality, "api", side_effect=[
                {"workflow_runs": []},
                [{"number": 7, "merge_commit_sha": SHA if match else "b"*40, "merged_at": "today"}],
            ]):
                text = quality.release_summary("org/repo", SHA)
                self.assertEqual("pull/7" in text, match)
                self.assertNotIn("checks passed", text)

    def test_unavailable_api_is_advisory(self):
        with patch.object(quality, "api", side_effect=subprocess.TimeoutExpired("gh", 1)):
            self.assertIn("unavailable", quality.release_summary("org/repo", SHA))
