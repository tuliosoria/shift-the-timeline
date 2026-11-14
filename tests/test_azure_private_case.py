import hashlib
import importlib.util
import json
import pathlib
import tempfile
import unittest
from unittest.mock import patch
import zipfile

spec=importlib.util.spec_from_file_location('private_case',pathlib.Path(__file__).parents[1]/'scripts/azure-private-case.py')
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class PrivateCaseTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=pathlib.Path(self.temp.name);self.commit='a'*40
        self.payload=b'{"synthetic":"PRIVATE_STORY_SENTINEL"}'
        self.pointer={'format':'shift-private-case-release-v1','sha256':hashlib.sha256(self.payload).hexdigest(),'bytes':len(self.payload),'caseCount':1,'translationCount':1}
        self.manifest=self.root/'pointer.json';self.manifest.write_text(json.dumps(self.pointer))
        self.artifact=self.root/'public.zip';self.output=self.root/'private.zip'
        with zipfile.ZipFile(self.artifact,'w')as z:
            z.writestr('server/azure-index.mjs','trusted code '+self.commit)
            z.writestr('public/app.js','public synthetic client')
            z.writestr('private/case.json','{"public":"demo"}')
            z.writestr('case-manifest.json','{"case":"public-demo"}')
        self.digest=hashlib.sha256(self.artifact.read_bytes()).hexdigest();self.calls=[];self.validated=False
    def cli(self,args):
        self.calls.append(args)
        self.assertEqual(args[args.index('--auth-mode')+1],'login')
        self.assertEqual(args[args.index('--account-name')+1],m.deploy.ACCOUNT)
        if args[:3]==['storage','container','show']:
            return json.dumps({'publicAccess':None})
        self.assertEqual(args[args.index('--container-name')+1],'releases')
        self.assertEqual(args[args.index('--name')+1],'case-libraries/'+self.pointer['sha256']+'.json')
        if args[:3]==['storage','blob','show']:
            return json.dumps({'bytes':len(self.payload),'etag':'"0x1234"'})
        if args[:3]==['storage','blob','download']:
            self.assertEqual(args[args.index('--if-match')+1],'"0x1234"')
            pathlib.Path(args[args.index('--file')+1]).write_bytes(self.payload);return ''
        self.fail('Unexpected Azure command')
    def validate(self,path,pointer):
        self.assertEqual(path.read_bytes(),self.payload);self.assertEqual(pointer,self.pointer);self.validated=True
    def run_hydrate(self,**kw):
        return m.hydrate(self.artifact,self.commit,self.digest,self.manifest,self.output,cli=kw.get('cli',self.cli),verify=kw.get('verify',self.validate))
    def test_private_payload_replaces_only_two_entries_and_preserves_public_zip(self):
        original=self.artifact.read_bytes();result=self.run_hydrate();self.assertTrue(self.validated)
        self.assertEqual(self.artifact.read_bytes(),original)
        with zipfile.ZipFile(self.artifact)as before,zipfile.ZipFile(self.output)as after:
            self.assertEqual(before.namelist(),after.namelist())
            for name in before.namelist():
                if name not in ('private/case.json','case-manifest.json'):self.assertEqual(before.read(name),after.read(name))
            self.assertEqual(after.read('private/case.json'),self.payload)
            self.assertEqual(json.loads(after.read('case-manifest.json')),{'case':'private-library','sha256':self.pointer['sha256']})
        self.assertEqual(result['sha256'],hashlib.sha256(self.output.read_bytes()).hexdigest())
        self.assertEqual(self.output.stat().st_mode&0o777,0o600)
        self.assertNotIn('PRIVATE_STORY',json.dumps(result))
    def test_missing_denied_or_public_container_fails_without_fallback(self):
        for mode in ('denied','public','missing'):
            def cli(args):
                if mode=='denied':raise RuntimeError('RAW_TOKEN_AND_STORY')
                if mode=='public':return '{"publicAccess":"blob"}'
                return '{}'
            with self.subTest(mode=mode),self.assertRaises(m.PrivateCaseError)as cm:self.run_hydrate(cli=cli)
            self.assertNotIn('RAW_TOKEN',str(cm.exception));self.assertFalse(self.output.exists());self.assertFalse(self.validated)
    def test_pointer_and_public_artifact_rejected_before_any_azure_read(self):
        for field,value in [('sha256','../escape'),('bytes',2_000_001),('url','https://outside.invalid'),('caseCount',True)]:
            bad={**self.pointer,field:value};self.manifest.write_text(json.dumps(bad))
            with self.subTest(field=field),self.assertRaises(m.PrivateCaseError):self.run_hydrate()
            self.assertEqual(self.calls,[])
        self.manifest.write_text(json.dumps(self.pointer));self.artifact.write_bytes(b'bad zip')
        with self.assertRaises(m.PrivateCaseError):self.run_hydrate()
        self.assertEqual(self.calls,[])
    def test_metadata_size_etag_and_download_integrity_fail_closed(self):
        for mode in ('size','etag','hash'):
            def cli(args):
                if args[:3]==['storage','blob','show']:
                    return json.dumps({'bytes':len(self.payload)+(1 if mode=='size'else 0),'etag':None if mode=='etag'else '"0x1234"'})
                out=self.cli(args)
                if mode=='hash'and args[:3]==['storage','blob','download']:pathlib.Path(args[args.index('--file')+1]).write_bytes(b'x'*len(self.payload))
                return out
            with self.subTest(mode=mode),self.assertRaises(m.PrivateCaseError):self.run_hydrate(cli=cli)
            self.assertFalse(self.output.exists());self.assertFalse(self.validated)
    def test_schema_failure_and_existing_output_do_not_publish(self):
        def reject(path,pointer):raise RuntimeError('PRIVATE_STORY_SENTINEL')
        with self.assertRaises(m.PrivateCaseError)as cm:self.run_hydrate(verify=reject)
        self.assertNotIn('PRIVATE_STORY',str(cm.exception));self.assertFalse(self.output.exists())
        self.output.write_bytes(b'existing')
        with self.assertRaises(m.PrivateCaseError):self.run_hydrate()
        self.assertEqual(self.output.read_bytes(),b'existing')
    def test_partial_output_is_removed_on_write_failure(self):
        original=pathlib.Path.open
        class BrokenWrite:
            def __init__(self,file):self.file=file
            def __enter__(self):return self
            def write(self,data):self.file.write(data[:10]);raise OSError('synthetic disk failure')
            def __exit__(self,*args):self.file.close()
        def open_file(path,*args,**kw):
            file=original(path,*args,**kw)
            return BrokenWrite(file)if path==self.output and args[0]=='xb'else file
        with patch.object(pathlib.Path,'open',open_file),self.assertRaises(m.PrivateCaseError):self.run_hydrate()
        self.assertFalse(self.output.exists())
    def test_duplicate_zip_slip_and_missing_data_entries_rejected(self):
        for name in ('../escape','private/case.json','other'):
            with zipfile.ZipFile(self.artifact,'w')as z:
                z.writestr('private/case.json','demo');z.writestr(name,'bad')
            self.digest=hashlib.sha256(self.artifact.read_bytes()).hexdigest()
            with self.subTest(name=name),self.assertRaises(m.PrivateCaseError):self.run_hydrate()
            self.assertFalse(self.output.exists())

if __name__=='__main__':unittest.main()
