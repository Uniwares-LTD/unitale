"""Safe response handling and host-change classification without network access."""
import copy
import contextlib
import importlib.util
import json
import io
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[2] / 'scripts/deploy'
sys.path.insert(0, str(SCRIPTS))
import preflight

spec = importlib.util.spec_from_file_location('impact', SCRIPTS / 'configuration-impact.py')
impact = importlib.util.module_from_spec(spec)
spec.loader.exec_module(impact)


class PreflightTests(unittest.TestCase):
    def test_v2_missing_retention_stops_before_configuration_preflight(self):
        request = dict(version=2, project='fixture', environment='staging', configurationHash='a'*64)
        def run(*args, **kwargs):
            kwargs['stdout'].write(json.dumps({'version':2,'capabilities':['operation-lock-v1']}).encode())
            return subprocess.CompletedProcess([], 0)
        with patch.object(preflight.subprocess, 'run', side_effect=run) as transport:
            state, message = preflight.check(request, 'config', 'test')
            self.assertEqual(state, 'rejected')
            self.assertIn('image-retention-v1', message)
            self.assertEqual(transport.call_count, 1)

    def response(self, **changes):
        return dict(version=1, compatible=True, code='COMPATIBLE', installedRevision='b'*64,
                    installedConfigurationHash='a'*64, requestedConfigurationHash='a'*64, **changes)

    def test_valid_matching_and_mismatch(self):
        value = self.response()
        self.assertTrue(preflight.validate_response(json.dumps(value), 'a'*64, 0)['compatible'])
        value.update(compatible=False, code='CONFIGURATION_MISMATCH', installedConfigurationHash='c'*64)
        self.assertFalse(preflight.validate_response(json.dumps(value), 'a'*64, 2)['compatible'])

    def test_malformed_inconsistent_and_oversized_responses(self):
        for changes in ({'version': True}, {'code': []}, {'compatible': 'true'},
                        {'installedRevision': 'private-value'}, {'installedConfigurationHash': 'c'*64},
                        {'requestedConfigurationHash': 'c'*64}, {'extra': 'secret'}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                preflight.validate_response(json.dumps({**self.response(), **changes}), 'a'*64, 0)
        for raw in ('legacy error', '{}', 'x'*4097):
            with self.assertRaises(ValueError): preflight.validate_response(raw, 'a'*64, 0)

    def test_transport_failure_and_timeout_are_unknown(self):
        request = {'configurationHash': 'a'*64}
        for error in (OSError('private'), subprocess.TimeoutExpired('ssh', 1)):
            with patch.object(preflight.subprocess, 'run', side_effect=error):
                state, message = preflight.check(request, 'config', 'test')
                self.assertEqual(state, 'unknown')
                self.assertNotIn('private', message)

    def test_legacy_or_invalid_ssh_output_is_not_echoed(self):
        def run(*args, **kwargs):
            kwargs['stdout'].write(b'legacy-private-error')
            return subprocess.CompletedProcess([], 255)
        with patch.object(preflight.subprocess, 'run', side_effect=run):
            state, message = preflight.check({'configurationHash': 'a'*64}, 'config', 'test')
            self.assertEqual(state, 'unknown')
            self.assertNotIn('legacy-private-error', message)

    def test_deployment_classification_requires_valid_complete_envelope(self):
        value = {**self.response(), 'compatible': False, 'code': 'CONFIGURATION_MISMATCH',
                 'installedConfigurationHash': 'c'*64}
        with tempfile.TemporaryDirectory() as temporary:
            log = Path(temporary) / 'result'
            for raw, status, expected in [(json.dumps(value), '2', 'rejected'),
                                          (json.dumps(value), '255', 'unknown'),
                                          ('runtime logs\n'+json.dumps(value), '2', 'unknown')]:
                log.write_text(raw, encoding='utf-8')
                output = io.StringIO()
                with patch.object(sys, 'argv', ['preflight.py', str(log), status]), \
                        patch.object(preflight.subprocess, 'check_output', return_value=json.dumps(
                            {'configurationHash': 'a'*64}).encode()), contextlib.redirect_stdout(output):
                    self.assertEqual(preflight.main(), 0)
                self.assertEqual(output.getvalue().strip(), expected)

    def test_permission_change_is_host_owned_but_diagnostics_is_not(self):
        before = {'version': 1, 'environment': 'staging', 'runtime': {'DIAGNOSTICS_ENABLED': 'false',
                  'MCP_CLIENTS_JSON': 'old-private-fixture'}}
        after = copy.deepcopy(before)
        after['runtime']['DIAGNOSTICS_ENABLED'] = 'true'
        self.assertIn('No host-profile change', impact.report(before, after))
        after['runtime']['MCP_CLIENTS_JSON'] = 'new-private-fixture'
        report = impact.report(before, after)
        self.assertIn('runtime.MCP_CLIENTS_JSON', report)
        self.assertNotIn('private-fixture', report)

    def test_real_dispatcher_reproduces_permission_correction_boundary(self):
        source = Path(os.environ.get('INFRASTRUCTURE_CHECKOUT', SCRIPTS.parents[2] / 'infrastructure')) / 'scripts/deploy-dispatch.py'
        if not source.exists():
            self.skipTest('Infrastructure checkout unavailable; real dispatcher integration not run')
        spec = importlib.util.spec_from_file_location('real_dispatch', source)
        dispatcher = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(dispatcher)
        from release_settings import host_configuration, configuration_hash
        candidate = json.loads((SCRIPTS.parents[1] / 'deploy/environments/staging.json').read_text(encoding='utf-8'))
        # This scenario needs enabled MCP and an explicit synthetic permission change,
        # independently of the consuming project's activation defaults.
        candidate['runtime']['MCP_ENABLED'] = 'true'
        candidate['runtime']['MCP_CLIENTS_JSON'] = json.dumps([{'id':'fixture', 'tokenEnv':'MCP_TOKEN_FIXTURE',
            'permissions':['server:read', 'run:read', 'artifact:read', 'artifact:write']}])
        installed = host_configuration(candidate)
        clients = json.loads(installed['runtime']['MCP_CLIENTS_JSON'])
        for client in clients:
            client['permissions'] = [p for p in client['permissions'] if p not in ('run:read', 'artifact:read', 'artifact:write')]
        installed['runtime']['MCP_CLIENTS_JSON'] = json.dumps(clients, separators=(',', ':'))
        request = dict(version=1, project='unibase', environment='staging', action='preflight',
                       configurationHash=configuration_hash(candidate))
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            registry = root / 'registry'; registry.mkdir()
            control = root / 'control/unibase' / ('b'*64)
            (control / 'deploy/environments').mkdir(parents=True)
            config = control / 'deploy/environments/staging.json'
            config.write_text(json.dumps(installed), encoding='utf-8')
            (control / 'project.config.json').write_text('{"slug":"unibase"}', encoding='utf-8')
            (registry / 'unibase.json').write_text(json.dumps({'revision': 'b'*64}), encoding='utf-8')
            with patch.object(dispatcher, 'REGISTRY', registry), patch.object(dispatcher, 'CONTROL', root/'control'), \
                    patch.object(dispatcher, 'trusted'), patch.object(dispatcher.subprocess, 'run') as execute:
                for expected, configuration in [('CONFIGURATION_MISMATCH', installed),
                                                ('COMPATIBLE', host_configuration(candidate))]:
                    config.write_text(json.dumps(configuration), encoding='utf-8')
                    output = io.StringIO()
                    with contextlib.redirect_stdout(output): status = dispatcher.handle(request)
                    response = preflight.validate_response(output.getvalue(), request['configurationHash'], status)
                    self.assertEqual(response['code'], expected)
                    execute.assert_not_called()
