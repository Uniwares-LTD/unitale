"""Declarative public configuration projection; never execute application code."""
import copy
import json
from pathlib import Path
from urllib.parse import urlsplit

PRIVATE = {'MONGODB_URI', 'REDIS_URL', 'FIREBASE_SERVICE_ACCOUNT_JSON',
           'DIFY_MANAGEMENT_KEY', 'DIFY_CREDENTIAL_ENCRYPTION_KEY',
           'PERSONA_COMPLETION_API_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET',
           'ASSET_S3_ACCESS_KEY_ID', 'ASSET_S3_SECRET_ACCESS_KEY'}


def load(path=None):
    path = path or Path(__file__).resolve().parents[2] / 'deploy/contract.json'
    contract = json.loads(Path(path).read_text(encoding='utf-8'))
    if type(contract.get('version')) is not int or contract['version'] != 1:
        raise ValueError('Unsupported deployment contract; upgrade the controller explicitly')
    if not isinstance(contract.get('settings'), dict):
        raise ValueError('Deployment contract settings required')
    for name, rule in contract['settings'].items():
        if rule.get('owner') not in ('image', 'host') or rule.get('type') not in ('integer', 'string-or-null'):
            raise ValueError('Unsupported setting ownership or validation: ' + name)
        if rule['owner'] == 'image' and name != 'runtime.DIAGNOSTICS_ENABLED':
            raise ValueError('New image ownership requires a controller contract upgrade')
    if contract.get('requiredCapabilities') not in (['operation-lock-v1'], ['operation-lock-v1', 'image-retention-v1'], ['operation-lock-v1', 'image-retention-v1', 'data-operations-v1']):
        raise ValueError('Unsupported controller capabilities')
    return contract


def project(config, contract=None):
    contract = contract or load()
    if not isinstance(config, dict) or type(config.get('version')) is not int or config['version'] != 1:
        raise ValueError('Unsupported environment configuration version')
    if config.get('environment') not in ('local', 'staging', 'production') or not isinstance(config.get('runtime'), dict):
        raise ValueError('Invalid configuration environment or runtime')
    result = copy.deepcopy(config)
    for section, value in config.items():
        if isinstance(value, dict) and not any(name.startswith(section + '.') for name in contract['settings']):
            raise ValueError('Unclassified configuration section: ' + section)
        entries = [(section + '.' + key, item) for key, item in value.items()] if isinstance(value, dict) else [(section, value)]
        for name, item in entries:
            key = name.split('.')[-1]
            if key in PRIVATE or key in contract.get('credentialReferences', []) or key.startswith(('DIFY_KEY_', 'MCP_TOKEN_')):
                local_uri = config.get('environment') == 'local' and name == 'runtime.MONGODB_URI'
                uri = urlsplit(item or '') if local_uri else None
                if not (local_uri and uri.scheme == 'mongodb' and uri.hostname in ('localhost', '127.0.0.1', '::1') and not uri.username and not uri.password):
                    raise ValueError('Credential values forbidden in public configuration: ' + name)
            rule = contract['settings'].get(name)
            if rule is None:
                raise ValueError('Unclassified setting; update deploy/contract.json: ' + name)
            if rule['type'] == 'integer' and type(item) is not int and not (
                    name == 'deployment.port' and config['environment'] == 'local' and item is None):
                raise ValueError('Expected integer setting: ' + name)
            if rule['type'] == 'string-or-null' and item is not None and not isinstance(item, str):
                raise ValueError('Expected string setting: ' + name)
            if isinstance(item, str) and any(char in item for char in '\r\n\0'):
                raise ValueError('Multiline configuration forbidden: ' + name)
            if name == 'runtime.DIAGNOSTICS_ENABLED' and (item not in ('true', 'false') or
                    (config.get('environment') == 'production' and item != 'false')):
                raise ValueError('Invalid image diagnostics setting')
            if rule['owner'] == 'image':
                parts = name.split('.')
                if len(parts) == 2:
                    result[parts[0]].pop(parts[1], None)
                else:
                    result.pop(name, None)
    return result
