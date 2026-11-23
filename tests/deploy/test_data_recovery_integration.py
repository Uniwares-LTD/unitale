"""Real encrypted archive/isolated MongoDB+GridFS restore in the disposable Linux image."""
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[2]
INFRA=Path('/infrastructure/scripts')

@unittest.skipUnless(os.environ.get('UNIBASE_DEPLOY_TEST_CONTAINER')=='1' and INFRA.is_dir(),'Docker/Linux recovery fixture unavailable; no live fallback')
class DataRecoveryIntegration(unittest.TestCase):
 def test_verified_archive_restores_records_indexes_and_gridfs_bytes(self):
  for tool in ('mongod','mongodump','mongorestore','restic','node'):
   self.assertIsNotNone(shutil.which(tool),'Missing required recovery fixture tool: '+tool)
  sys.path.insert(0,str(INFRA));import recovery
  with tempfile.TemporaryDirectory(prefix='data-recovery-') as temp:
   root=Path(temp);database=root/'mongo';database.mkdir();work=root/'work';work.mkdir()
   with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
   uri='mongodb://127.0.0.1:'+str(port)
   process=subprocess.Popen(['mongod','--bind_ip','127.0.0.1','--port',str(port),'--dbpath',str(database),'--logpath',str(root/'mongo.log')],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
   helper=r'''
const {MongoClient,GridFSBucket}=require('/test-tools/node_modules/mongodb');
(async()=>{
const input=JSON.parse(require('fs').readFileSync(0,'utf8'));const client=new MongoClient(input.uri,{serverSelectionTimeoutMS:10000});
try{const db=client.db(input.database);const bucket=new GridFSBucket(db);
if(input.seed){await db.collection('business').insertMany([{key:'one',value:12},{key:'two',value:34}]);await db.collection('business').createIndex({key:1},{unique:true});await new Promise((resolve,reject)=>{const stream=bucket.openUploadStream('fixture.bin');stream.on('finish',resolve);stream.on('error',reject);stream.end(Buffer.from([0,1,255,13,10,42,99]));});}
const rows=await db.collection('business').find({},{projection:{_id:0}}).sort({key:1}).toArray();const parts=[];for await(const part of bucket.openDownloadStreamByName('fixture.bin'))parts.push(part);const indexes=await db.collection('business').listIndexes().toArray();console.log(JSON.stringify({rows,bytes:Buffer.concat(parts).toString('base64'),unique:indexes.some(x=>x.name==='key_1'&&x.unique)}));
}finally{await client.close();}})().catch(()=>process.exit(1));
'''
   def node(name,seed=False):
    return json.loads(subprocess.check_output(['node','-e',helper],input=json.dumps({'uri':uri,'database':name,'seed':seed}).encode(),stderr=subprocess.DEVNULL,timeout=30))
   try:
    original=node('fixture_staging',True)
    password=root/'password';password.write_text('disposable-recovery-password');password.chmod(0o600)
    env=dict(os.environ,RESTIC_REPOSITORY=str(root/'encrypted-repository'),RESTIC_PASSWORD_FILE=str(password))
    recovery.run(['restic','init'],env)
    session=recovery.BackupSession.__new__(recovery.BackupSession)
    session.plan={'project':'fixture','environment':'staging'};session.target='staging';session.directory=work;session.env=env
    session.mongo=work/'mongo.yml';session.mongo.write_text('uri: '+json.dumps(uri)+'\n');session.mongo.chmod(0o600)
    backup=session.backup('fixture_staging');self.assertTrue(backup['verified'])
    archive,hashed=session.retrieve(backup['backupId'],'fixture_staging',backup['sha256']);self.assertEqual(hashed,backup['sha256'])
    recovery.run(['mongorestore','--config',str(session.mongo),'--archive='+str(archive),'--gzip','--drop','--nsFrom=fixture_staging.*','--nsTo=fixture_staging_rehearsal_test.*'])
    self.assertEqual(node('fixture_staging_rehearsal_test'),original)
    self.assertEqual(original['bytes'],'AAH/DQoqYw==');self.assertTrue(original['unique'])
   finally:
    process.terminate()
    try:process.wait(timeout=15)
    except subprocess.TimeoutExpired:process.kill();process.wait()
