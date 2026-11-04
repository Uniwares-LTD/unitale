"""Public ownership and secret-exclusion boundaries."""
import copy
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts/deploy'))
from deployment_contract import load, project


class ContractTests(unittest.TestCase):
    def setUp(self):
        self.config = json.loads((ROOT / 'deploy/environments/staging.json').read_text())

    def test_unknown_and_private_fields_fail_closed(self):
        for field in ('MONGODB_URI', 'MCP_TOKEN_DIFY', 'PLAY_BILLING_SERVICE_ACCOUNT_JSON', 'UNKNOWN_SETTING'):
            changed = copy.deepcopy(self.config)
            changed['runtime'][field] = 'canary'
            with self.assertRaises(ValueError): project(changed)
        with self.assertRaises(ValueError): project({**self.config, 'unknown': {}})

    def test_diagnostics_projection_does_not_mutate_input(self):
        # Test preservation with synthetic data, independent of project provisioning.
        self.config['runtime']['MCP_CLIENTS_JSON'] = json.dumps([
            {'id': 'fixture', 'tokenEnv': 'MCP_TOKEN_FIXTURE', 'permissions': ['server:read']}
        ])
        original = copy.deepcopy(self.config)
        result = project(self.config)
        self.assertNotIn('DIAGNOSTICS_ENABLED', result['runtime'])
        self.assertEqual(self.config, original)
        self.assertEqual(result['runtime']['MCP_CLIENTS_JSON'], original['runtime']['MCP_CLIENTS_JSON'])

    def test_local_uri_must_be_loopback_and_credential_free(self):
        config = json.loads((ROOT / 'deploy/environments/local.json').read_text())
        project(config)
        for uri in ('mongodb://user:secret@localhost/db', 'mongodb://remote/db'):
            config['runtime']['MONGODB_URI'] = uri
            with self.assertRaises(ValueError): project(config)

    def test_infrastructure_interpreter_has_identical_semantics(self):
        sibling = ROOT.parent / 'infrastructure/scripts/deployment_contract.py'
        if not sibling.exists(): self.skipTest('Infrastructure checkout unavailable')
        self.assertEqual(sibling.read_text(encoding='utf-8-sig'),
                         (ROOT / 'scripts/deploy/deployment_contract.py').read_text(encoding='utf-8-sig'))
