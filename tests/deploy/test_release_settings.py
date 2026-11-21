"""Release settings cross the deployment boundary; never include private data."""
import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / 'scripts/deploy'))
from release_settings import configuration_hash, host_configuration, validate_settings
from test_config import fixture, config_module


class ReleaseSettingsTests(unittest.TestCase):
    def setUp(self):
        self.config = json.loads((REPO / 'deploy/environments/staging.json').read_text())

    def test_flag_is_mutable_but_other_settings_remain_bound(self):
        before = copy.deepcopy(self.config)
        before['runtime'].pop('DIAGNOSTICS_ENABLED', None)
        digest = configuration_hash(before)
        self.assertEqual(digest, configuration_hash(self.config))
        for flag in ('false', 'true'):
            changed = copy.deepcopy(self.config)
            changed['runtime']['DIAGNOSTICS_ENABLED'] = flag
            self.assertEqual(digest, configuration_hash(changed))
        for section, key, value in [('runtime', 'APP_ORIGIN', 'https://other.test'),
                                    ('runtime', 'MONGODB_DATABASE', 'other_db'),
                                    ('runtime', 'MCP_ENABLED', 'false' if self.config['runtime']['MCP_ENABLED'] == 'true' else 'true'),
                                    ('deployment', 'imageRepository', 'ghcr.io/other/app'),
                                    ('deployment', 'port', 32199)]:
            changed = copy.deepcopy(self.config)
            changed[section][key] = value
            self.assertNotEqual(digest, configuration_hash(changed))

    def test_exact_boolean_strings_and_no_extra_or_missing_fields(self):
        for target in ('local', 'staging', 'production'):
            self.assertEqual(validate_settings({'DIAGNOSTICS_ENABLED': 'false'}, target), {'DIAGNOSTICS_ENABLED': 'false'})
        for value in [True, False, None, 1, 'TRUE', 'true\nAPP_ENV=production', '']:
            with self.subTest(value=value), self.assertRaises(ValueError):
                validate_settings({'DIAGNOSTICS_ENABLED': value}, 'staging')
        for settings in [{}, {'MONGODB_URI': 'canary'}, {'DIAGNOSTICS_ENABLED': 'true', 'APP_ORIGIN': 'https://other.test'}]:
            with self.assertRaises(ValueError): validate_settings(settings, 'staging')
        with self.assertRaises(ValueError): validate_settings({'DIAGNOSTICS_ENABLED': 'true'}, 'production')

    def test_request_binds_required_controller_capabilities(self):
        request = json.loads(subprocess.check_output([sys.executable, str(REPO / 'scripts/deploy/dispatch-request.py'),
            'deploy', 'staging', 'ghcr.io/test/app@sha256:' + 'a'*64, 'b'*40], text=True))
        self.assertEqual(request['version'], 2)
        self.assertNotIn('runtimeSettings', request)
        self.assertEqual(set(request), {'version','project','environment','action','configurationHash','image','commit','requiredCapabilities'})
        self.assertEqual(request['requiredCapabilities'], ['operation-lock-v1', 'image-retention-v1'])
        self.assertEqual(request['configurationHash'], configuration_hash(self.config))
        check = json.loads(subprocess.check_output([sys.executable, str(REPO / 'scripts/deploy/dispatch-request.py'), 'check', 'staging'], text=True))
        self.assertNotIn('runtimeSettings', check)

    def test_host_projection_excludes_only_image_owned_settings(self):
        original = copy.deepcopy(self.config)
        projected = host_configuration(self.config)
        self.assertNotIn('DIAGNOSTICS_ENABLED', projected['runtime'])
        for key, value in self.config['runtime'].items():
            if key != 'DIAGNOSTICS_ENABLED': self.assertEqual(projected['runtime'][key], value)
        self.assertEqual(projected['deployment'], self.config['deployment'])
        self.assertEqual(self.config, original)

    def test_runtime_merge_preserves_private_values(self):
        with tempfile.TemporaryDirectory() as temporary:
            destination = Path(temporary) / 'runtime.env'
            expected = self.config['runtime']['DIAGNOSTICS_ENABLED']
            previous = 'false' if expected == 'true' else 'true'
            destination.write_text(f'MONGODB_URI=private-canary\nREDIS_URL=private-redis\nDIAGNOSTICS_ENABLED={previous}\n')
            subprocess.check_call([sys.executable, str(REPO / 'scripts/deploy/render-runtime.py'),
                'staging', str(destination)])
            values = dict(line.split('=', 1) for line in destination.read_text().splitlines())
            self.assertEqual(values['DIAGNOSTICS_ENABLED'], expected)
            self.assertEqual(values['MONGODB_URI'], 'private-canary')

    def test_host_validation_rejects_production_enablement(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            fixture(root)
            path = root / 'production/runtime.env'
            path.write_text(path.read_text() + 'DIAGNOSTICS_ENABLED=true\n')
            with self.assertRaises(ValueError): config_module.validate(root, 'production')
