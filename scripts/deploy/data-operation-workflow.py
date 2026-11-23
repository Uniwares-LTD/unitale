"""Workflow adapter around the same fixed operations CLI; emits public evidence only."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import uuid

OUTPUTS=('operation_id','plan_digest','source_commit','image','deployment_outcome','migration_outcome','backup_id','report_artifact','activation_decision','next_action')

def outputs(value):
    data=value.get('dataOperation') or value
    plan=value.get('plan',{})
    result=dict(operation_id=value.get('planId',data.get('operationId','')),plan_digest=value.get('digest',data.get('planDigest','')),source_commit=plan.get('sourceCommit',data.get('sourceCommit','')),image=plan.get('image',data.get('image','')),deployment_outcome=data.get('deploymentOutcome','not-attempted'),migration_outcome=data.get('migrationOutcome','pending' if plan.get('classification')=='data-migration' else 'unknown'),backup_id=(data.get('backup') or {}).get('backupId',''),report_artifact='data-operation-report.json',activation_decision=value.get('activationDecision',data.get('activationDecision','owner-action-required')),next_action=value.get('nextAction',data.get('nextAction','Inspect the exact plan/status before execution.')))
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'],'a',encoding='utf-8') as stream:
            for key in OUTPUTS:
                text=str(result[key])
                if '\n' in text or '\r' in text:raise ValueError('INVALID_OUTPUT')
                stream.write(key+'='+text+'\n')
    return result

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=['report','prepare-backup','prepare-migration','status']);parser.add_argument('environment',choices=['staging','prod','production'])
    parser.add_argument('--image');parser.add_argument('--commit');parser.add_argument('--plan-id');parser.add_argument('--output',type=Path,default=Path(os.environ.get('RUNNER_TEMP','output'))/'data-operation-report.json')
    args=parser.parse_args()
    names={'report':'migrations','prepare-backup':'backup','prepare-migration':'migrate','status':'status'}
    command=[sys.executable,str(Path(__file__).with_name('operations.py')),names[args.action],args.environment]
    for name in ('image','commit','plan_id'):
        value=getattr(args,name)
        if value:command+=['--'+name.replace('_','-'),value]
    if args.action.startswith('prepare-'):
        run=os.environ.get('GITHUB_RUN_ID')
        request=str(uuid.uuid5(uuid.NAMESPACE_URL,os.environ.get('GITHUB_REPOSITORY','')+':'+run+':'+args.action+':'+args.environment)) if run else str(uuid.uuid4())
        command+=['--request-id',request]
    result=subprocess.run(command,stdout=subprocess.PIPE,check=True,timeout=1300)
    value=json.loads(result.stdout)
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(value,indent=2)+'\n',encoding='utf-8')
    fields=outputs(value)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'],'a',encoding='utf-8') as stream:
            stream.write('Data operations: '+fields['activation_decision']+'\n\n'+fields['next_action']+'\n\n')
            if fields['operation_id']:stream.write('Plan ID/digest: `'+fields['operation_id']+'`\n\nReview the exact plan, then use [Infrastructure Apply deployment plan](https://github.com/Uniwares-LTD/infrastructure/actions/workflows/apply-deployment-plan.yml).\n')
    print(json.dumps(fields))

if __name__=='__main__':
    try:main()
    except Exception:raise SystemExit('Data-operation report unavailable. Inspect the recorded request/plan before any retry; private details suppressed.') from None
