"""The public CLI remains report/prepare/status only and collects complete evidence."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'scripts/deploy'))
import operations as ops

class DataCliTests(unittest.TestCase):
 def test_report_pages_full_ledger_and_refuses_drift(self):
  for drift in (False,True):
   calls=[]
   def transport(request,*args,**kwargs):
    calls.append(request);offset=request.get('offset',0)
    return dict(version=1,ledgerDigest=('1' if drift and offset else '0')*64,manifestDigest='a'*64,sourceCommit='b'*40,image='ghcr.io/test/fixture@sha256:'+'c'*64,ledger=list(range(offset,min(offset+100,205))),applied=list(range(offset,min(offset+100,205))),pending=[],disabled=[],changed=[],unknown=[],bespoke=[],required=[],ledgerPaging={'nextOffset':offset+100 if offset+100<205 else None},detailPaging={'nextOffset':offset+100 if offset+100<205 else None})
   with patch.object(sys,'argv',['operations.py','migrations','staging']),patch.object(ops,'load',return_value={}),patch.object(ops,'configuration_hash',return_value='f'*64),patch.object(ops,'transport',transport),contextlib.redirect_stdout(io.StringIO()) as out:
    if drift:
     with self.assertRaises(ValueError):ops.main()
    else:
     ops.main();value=json.loads(out.getvalue());self.assertEqual(value['ledger'],list(range(205)));self.assertEqual(len(calls),3)
     self.assertTrue(all(call['requiredCapabilities']==['data-operations-v1'] for call in calls))

 def test_prepare_binds_explicit_retry_request_and_has_no_apply_shortcut(self):
  calls=[];batch=[{'id':'core:0001-test','checksum':'a'*64}]
  def transport(request,*args,**kwargs):
   calls.append(request)
   if request['action']=='migrate':return {'planId':'b'*64,'digest':'b'*64,'plan':{'migrationRequest':{'ledgerDigest':'c'*64,'manifestDigest':'d'*64,'pending':batch}}}
   return {'ledgerDigest':'c'*64,'manifestDigest':'d'*64}
  args=['operations.py','migrate','staging','--image','ghcr.io/test/fixture@sha256:'+'e'*64,'--commit','f'*40,'--request-id','11111111-1111-4111-8111-111111111111']
  with patch.object(sys,'argv',args),patch.object(ops,'load',return_value={}),patch.object(ops,'configuration_hash',return_value='f'*64),patch.object(ops,'transport',transport),contextlib.redirect_stdout(io.StringIO()),contextlib.redirect_stderr(io.StringIO()):ops.main()
  self.assertEqual(calls[0]['requestId'],args[-1]);self.assertEqual(calls[0]['action'],'migrate');self.assertEqual(calls[1]['action'],'migrations')
  with patch.object(sys,'argv',['operations.py','apply','staging']),contextlib.redirect_stderr(io.StringIO()):
   with self.assertRaises(SystemExit):ops.main()
