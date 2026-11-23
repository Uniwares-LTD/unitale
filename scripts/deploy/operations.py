"""One application interface to fixed Infrastructure operations; no remote shell."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import uuid
from environment import load, ROOT
from release_settings import configuration_hash


class OperationError(ValueError):
    pass


def transport(request, config, timeout=1300):
    slug = request['project']
    directory = os.environ.get('RUNNER_TEMP')
    if not directory:
        raise ValueError('Set RUNNER_TEMP and run scripts/deploy/access.sh with the named deployment key and pinned host key')
    ssh_config = Path(directory) / (slug + '-access/config')
    with tempfile.TemporaryFile() as output:
        try:
            result = subprocess.run(['ssh', '-F', str(ssh_config), '-o', 'BatchMode=yes',
                                     '-o', 'ConnectTimeout=10', slug + '-vps', 'operate'],
                                    input=json.dumps(request).encode(), stdout=output,
                                    stderr=subprocess.DEVNULL, timeout=timeout)
        except (OSError, subprocess.TimeoutExpired):
            raise ValueError('Outcome unknown; inspect status before retrying') from None
        output.seek(0)
        raw = output.read(65537)
    if result.returncode or len(raw) > 65536:
        try:
            code=json.loads(raw).get('code')
        except (ValueError,AttributeError):code=None
        if code in {'OWNER_ACTION_REQUIRED','HOST_STATE_CHANGED','READBACK_REQUIRED','APPROVAL_REPLAY','UNSUPPORTED_CAPABILITY','OTHER_ENVIRONMENT_CHANGED'}:
            raise OperationError(code+': inspect the plan and Infrastructure operations guide before retrying')
        raise OperationError('Operation rejected or outcome unknown; inspect status and the Infrastructure runbook')
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise ValueError('Invalid controller response')
    return value


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['doctor', 'maintenance', 'plan', 'status', 'check', 'rollback', 'backup', 'restore', 'migrations', 'migrate'])
    parser.add_argument('environment', choices=['staging', 'prod', 'production'])
    parser.add_argument('--bundle', type=Path)
    parser.add_argument('--manifest', type=Path)
    parser.add_argument('--image')
    parser.add_argument('--commit')
    parser.add_argument('--request-id')
    parser.add_argument('--offset',type=int,default=0)
    parser.add_argument('--controller-checksum', help='Observed installed dispatcher checksum for a controller plan')
    parser.add_argument('--plan-id')
    parser.add_argument('--backup-id')
    parser.add_argument('--destination')
    args = parser.parse_args()
    if args.commit and args.action not in ('migrations','migrate'):parser.error('--commit applies only to migration reports/plans')
    if args.image and args.action not in ('plan','migrations','migrate'):parser.error('--image applies only to candidate plans/reports')
    if args.offset<0:parser.error('--offset must be nonnegative')
    target = 'prod' if args.environment == 'production' else args.environment
    config = load(target, require_connections=args.action in ('plan','check','rollback'))
    slug = json.loads((ROOT / 'project.config.json').read_text())['slug']
    if args.action == 'doctor':
        try:
            load(target)  # Validate all public bindings, without contacting providers.
        except ValueError as error:
            message=str(error)
            if re.fullmatch(r'Missing public configuration: [A-Za-z0-9_., ]+',message):
                raise OperationError(message) from None
            raise
        print(json.dumps({'configuration': 'valid', 'target': target,
                          'configurationHash': configuration_hash(config),
                          'requiredController': 2, 'requiredCapabilities': ['operation-lock-v1', 'image-retention-v1'],
                          'maintenanceStatusCommand': 'npm run deploy:ops -- maintenance ' + target,
                          'hostInstallation': 'not verified'}))
        return
    request = dict(version=2, project=slug, environment=target, action=args.action)
    if args.action in ('check', 'rollback'):
        request['configurationHash'] = configuration_hash(config)
        # These operations produce the existing bounded release report, not plan JSON.
        subprocess.run(['bash', str(Path(__file__).with_name('host-operation.sh')),
                        args.action, args.environment], check=True)
        return
    if args.action == 'plan':
        if not args.bundle or not args.manifest or not args.image:
            parser.error('plan requires --bundle, --manifest and immutable --image')
        manifest = json.loads(args.manifest.read_text(encoding='utf-8-sig'))
        raw = args.bundle.read_bytes()
        if hashlib.sha256(raw).hexdigest() != manifest['bundleChecksum']:
            raise ValueError('Bundle checksum differs from reviewed manifest')
        request.update(bundle=base64.b64encode(raw).decode(), candidate=dict(
            project=slug, environment=target, sourceCommit=manifest['sourceCommit'], image=args.image,
            bundleChecksum=manifest['bundleChecksum'], configurationHash=configuration_hash(config),
            classification='host-configuration', changedSettings=[], credentialReferences=[]))
        if manifest.get('classification')=='controller':
            if not args.controller_checksum or not re.fullmatch('[a-f0-9]{64}',args.controller_checksum):
                parser.error('controller plan requires the observed --controller-checksum')
            request['candidate'].update(classification='controller',controllerExpectedChecksum=args.controller_checksum)

    elif args.action == 'status':
        if not args.plan_id or not re.fullmatch('[a-f0-9]{64}', args.plan_id):
            parser.error('status requires the exact --plan-id')
        request['planId'] = args.plan_id
        if args.offset:request['offset']=args.offset
    elif args.action in ('migrations','migrate'):
        if bool(args.image)!=bool(args.commit) or (args.image and (not re.fullmatch(r'ghcr.io/[a-z0-9_.-]+/[a-z0-9_.-]+@sha256:[a-f0-9]{64}',args.image) or not re.fullmatch('[a-f0-9]{40}',args.commit))):parser.error('provide exact immutable --image and --commit together')
        if args.action=='migrate' and not args.image:parser.error('migrate requires exact --image and --commit')
        request.update(image=args.image,commit=args.commit,configurationHash=configuration_hash(config),requiredCapabilities=['data-operations-v1'])
        if args.action=='migrate':
            request_id=args.request_id or str(uuid.uuid4())
            if str(uuid.UUID(request_id))!=request_id:parser.error('canonical UUID required for --request-id')
            print('request_id='+request_id,file=sys.stderr);request['requestId']=request_id
        elif args.offset:request['offset']=args.offset
    elif args.action in ('backup', 'restore'):
        request.update(backupId=args.backup_id, destination=args.destination)
        if args.action=='backup':
            request_id=args.request_id or str(uuid.uuid4())
            if str(uuid.UUID(request_id))!=request_id:parser.error('canonical UUID required for --request-id')
            print('request_id='+request_id,file=sys.stderr)
            request.update(requestId=request_id,requiredCapabilities=['data-operations-v1'])
    response=transport(request,config,timeout=3700 if request.get('requiredCapabilities')==['data-operations-v1'] else 1300)
    def collect(report_request,first=None):
        value=first if first is not None else transport(report_request,config)
        if 'ledgerPaging' not in value:return value
        identities={key:value.get(key) for key in ('ledgerDigest','manifestDigest','sourceCommit','image')}
        while value['ledgerPaging']['nextOffset'] is not None or value['detailPaging']['nextOffset'] is not None:
            offset=max(x or 0 for x in (value['ledgerPaging']['nextOffset'],value['detailPaging']['nextOffset']))
            page=transport({**report_request,'offset':offset},config)
            if {key:page.get(key) for key in identities}!=identities:raise ValueError('Report changed during paging; repeat the read-only report')
            for key in ('ledger','pending','applied','disabled','changed','unknown','bespoke','required'):value[key].extend(page[key])
            value['ledgerPaging']=page['ledgerPaging'];value['detailPaging']=page['detailPaging']
        return value
    if args.action=='migrations' and not args.offset:response=collect(request,response)
    if args.action=='migrate' and 'plan' in response:
        report_request={key:value for key,value in request.items() if key!='requestId'};report_request['action']='migrations'
        reviewed=collect(report_request);response['report']=reviewed
        if reviewed.get('ledgerDigest')!=response['plan']['migrationRequest']['ledgerDigest'] or reviewed.get('manifestDigest')!=response['plan']['migrationRequest']['manifestDigest']:
            response.update(activationDecision='owner-action-required',nextAction='The prepared plan exists but the reviewed state moved; inspect it and prepare a fresh request after review.')
    print(json.dumps(response, indent=2))


if __name__ == '__main__':
    try:
        main()
    except OperationError as error:
        raise SystemExit(str(error)) from None
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError):
        raise SystemExit('Operation stopped; validate public inputs and inspect status. Private details suppressed.') from None
