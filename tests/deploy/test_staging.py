"""Initial staging boundaries without cloud credentials or live services."""
import copy
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from urllib.error import HTTPError
from unittest.mock import patch
from test_provision import environment_fixture, environment, routes, provisioning

def module(name):
    path=Path(__file__).resolve().parents[2]/'scripts/deploy'/(name+'.py')
    spec=importlib.util.spec_from_file_location(name,path)
    value=importlib.util.module_from_spec(spec); spec.loader.exec_module(value); return value

package=module('public-package')
prepare=module('prepare-host')

class StagingTests(unittest.TestCase):
    def test_direct_existing_provider_configuration(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary); c=environment_fixture(root)
            c['shared']['routeMode']='owner-managed'; c['shared']['routeWorkflow']=None
            c['ssh'].update(transport='direct',cloudflaredVersion=None,cloudflaredSha256=None)
            c['google'].update(workloadIdentityProvider=None,provisionerServiceAccount=None)
            c['ghcr']['pullUser']=None
            file=root/'deploy/environments/staging.json'; file.write_text(json.dumps(c))
            self.assertEqual(environment.load('staging',root)['ssh']['transport'],'direct')
            c['shared']['routeMode']='skip'; file.write_text(json.dumps(c))
            with self.assertRaises(ValueError): environment.load('staging',root)
            # The project initializer clears source-specific profile fields to null.
            c['shared']['routeMode']=None; c['ssh']['transport']=None
            file.write_text(json.dumps(c))
            environment.load('staging',root,require_connections=False)

    def test_public_package_and_first_publication(self):
        for stage,visibility,passes in [('before',None,True),('after',None,False),('before','private',False),('after','public',True)]:
            def opener(request,**kwargs):
                if '/users/' in request.full_url: return io.BytesIO(b'{"type":"Organization"}')
                if visibility is None: raise HTTPError(request.full_url,404,'missing',{},None)
                return io.BytesIO(json.dumps({'visibility':visibility}).encode())
            with self.subTest(stage=stage,visibility=visibility):
                if passes: package.verify(stage,'fixture/app','synthetic',opener)
                else:
                    with self.assertRaises((ValueError,HTTPError)): package.verify(stage,'fixture/app','synthetic',opener)

    def test_owner_route_must_be_exact_unshadowed_and_have_dns(self):
        config={'runtime':{'APP_ORIGIN':'https://staging.example.test'},'deployment':{'port':35101},'shared':{'cloudflareAccountId':'a'*32,'cloudflareZoneId':'b'*32,'tunnelId':'11111111-1111-4111-8111-111111111111'}}
        exact={'hostname':'staging.example.test','service':'http://localhost:35101'}
        class Fake:
            ingress=[exact,{'service':'http_status:404'}]
            proxied=True
            def request(self,method,url,headers):
                assert method=='GET'
                if '/configurations' in url: return {'success':True,'result':{'config':{'ingress':self.ingress}}}
                return {'success':True,'result':[{'type':'CNAME','content':config['shared']['tunnelId']+'.cfargotunnel.com','proxied':self.proxied}]}
        api=Fake(); routes.verify_owner_managed(config,'synthetic',api)
        for ingress in ([{'service':'http_status:404'},exact],[{**exact,'service':'http://localhost:3200'}],[{**exact,'path':'/limited'}]):
            api.ingress=ingress
            with self.assertRaises(ValueError): routes.verify_owner_managed(config,'synthetic',api)
        api.ingress=[exact]; api.proxied=False
        with self.assertRaises(ValueError): routes.verify_owner_managed(config,'synthetic',api)

    def test_existing_firebase_identity_and_runtime_are_validated(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary); config=environment_fixture(root)
            credentials={'firebase':{'type':'service_account','project_id':config['google']['projectId'],'private_key':'synthetic-fixture'},'firebaseApiKey':'test-public-key','firebaseAppId':'test-public-app','mongodbUri':f"mongodb+srv://{config['atlas']['mongoUser']}:test-password@example.test"}
            for bad in (False,True):
                destination=root/('bad' if bad else 'valid'); destination.mkdir()
                value=copy.deepcopy(credentials)
                if bad: value['firebase']['project_id']='another-project'
                with patch.object(prepare,'ROOT',root):
                    if bad:
                        with self.assertRaises(ValueError): prepare.materialize(config,value,destination,'r'*43)
                    else: prepare.materialize(config,value,destination,'r'*43)

    def test_prepared_redis_password_must_match_installed_selection(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary); config=environment_fixture(root)
            credentials={'firebase':{},'firebaseApiKey':'public','firebaseAppId':'public','mongodbUri':'synthetic','redisPassword':'s'*43}
            with self.assertRaisesRegex(ValueError, 'Redis credential differs'):
                prepare.materialize(config,credentials,root/'candidate','r'*43)

    def test_initial_ai_requires_allowlisted_secrets_and_retained_encryption_key(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary); config=environment_fixture(root)
            credentials={'firebase':{},'firebaseApiKey':'public','firebaseAppId':'public','mongodbUri':'synthetic','ai':{'APP_ORIGIN':'http://localhost'}}
            with self.assertRaisesRegex(ValueError,'forbidden'):
                prepare.materialize(config,credentials,root/'candidate','r'*43)
            credentials['ai']={}
            config['runtime']['MCP_ENABLED']='true'
            with self.assertRaisesRegex(ValueError,'retained explicit encryption'):
                prepare.materialize(config,credentials,root/'candidate','r'*43)

if __name__=='__main__': unittest.main()
