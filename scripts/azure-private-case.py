#!/usr/bin/env python3
"""Read one pinned private library and hydrate data-only entries in a tested ZIP.

No uploads, deployment, credential discovery, IAM or application setting changes.
All Azure targets are fixed. Raw CLI output, private data and exception text stay private.
"""
import argparse
import hashlib
import importlib.util
import io
import json
import pathlib
import re
import subprocess
import tempfile
import zipfile

ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('shift_deploy',ROOT/'scripts/azure-ci-deploy.py')
deploy=importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)
STAGES=frozenset(('pointer','artifact','container','metadata','download','integrity','schema','hydrate'))
MAX_CASE=2_000_000

class PrivateCaseError(Exception):
    def __init__(self,stage='unknown'):
        self.stage=stage if stage in STAGES else 'unknown'
        super().__init__('Private case release unavailable; deployment stopped.')

def pointer_from_file(path):
    with open(path,'rb')as file:raw=file.read(4097)
    if len(raw)>4096:raise PrivateCaseError('pointer')
    value=json.loads(raw)
    if (not isinstance(value,dict)or set(value)!={'format','sha256','bytes','caseCount','translationCount'}
        or value['format']!='shift-private-case-release-v1'
        or not isinstance(value['sha256'],str)or not re.fullmatch('[a-f0-9]{64}',value['sha256'])
        or type(value['bytes'])is not int or not 1<=value['bytes']<=MAX_CASE
        or type(value['caseCount'])is not int or not 1<=value['caseCount']<=20
        or type(value['translationCount'])is not int or not value['caseCount']<=value['translationCount']<=60):
        raise PrivateCaseError('pointer')
    return value

def verify_schema(path,pointer):
    # The pointer copy prevents the caller's file changing between validation and Node.
    pin=path.parent/'verified-pointer.json';pin.write_text(json.dumps(pointer));pin.chmod(0o600)
    result=subprocess.run(['node',str(ROOT/'scripts/verify-case-release.mjs'),str(path),str(pin)],capture_output=True,timeout=30,check=False)
    expected={k:pointer[k]for k in ('sha256','bytes','caseCount','translationCount')}
    if result.returncode or len(result.stdout)>1024 or json.loads(result.stdout)!=expected:raise PrivateCaseError('schema')

def hydrate(artifact,commit,digest,manifest,output,*,cli=deploy.run_cli,verify=verify_schema):
    stage='pointer';output=pathlib.Path(output);created_output=False
    try:
        pointer=pointer_from_file(manifest)
        stage='artifact';data=deploy.validate_artifact(artifact,commit,digest)
        if output.exists()or output.is_symlink():raise PrivateCaseError(stage)
        with zipfile.ZipFile(io.BytesIO(data))as archive:
            if not {'private/case.json','case-manifest.json','server/azure-index.mjs'}.issubset(archive.namelist()):raise PrivateCaseError(stage)
        blob='case-libraries/'+pointer['sha256']+'.json'
        stage='container'
        info=json.loads(cli(['storage','container','show','--subscription',deploy.SUBSCRIPTION,'--account-name',deploy.ACCOUNT,'--name',deploy.CONTAINER,'--auth-mode','login','--query','properties','--output','json']))
        if not isinstance(info,dict)or 'publicAccess'not in info or info['publicAccess']is not None:raise PrivateCaseError(stage)
        stage='metadata'
        info=json.loads(cli(['storage','blob','show',*deploy.storage_args(),'--name',blob,'--query','{bytes:properties.contentLength,etag:properties.etag}','--output','json']))
        if (not isinstance(info,dict)or type(info.get('bytes'))is not int or info['bytes']!=pointer['bytes']
            or not isinstance(info.get('etag'),str)or not re.fullmatch(r'"?[A-Za-z0-9_-]{1,128}"?',info['etag'])):raise PrivateCaseError(stage)
        with tempfile.TemporaryDirectory(prefix='shift-private-case-')as directory:
            path=pathlib.Path(directory)/'case.json';stage='download'
            cli(['storage','blob','download',*deploy.storage_args(),'--name',blob,'--file',str(path),'--if-match',info['etag'],'--no-progress','--output','none'])
            path.chmod(0o600);stage='integrity'
            with path.open('rb')as file:payload=file.read(MAX_CASE+1)
            if len(payload)!=pointer['bytes']or hashlib.sha256(payload).hexdigest()!=pointer['sha256']:raise PrivateCaseError(stage)
            stage='schema';verify(path,pointer)
            stage='hydrate';buffer=io.BytesIO()
            with zipfile.ZipFile(io.BytesIO(data))as before,zipfile.ZipFile(buffer,'w')as after:
                for entry in before.infolist():
                    content=before.read(entry.filename)
                    if entry.filename=='private/case.json':content=payload
                    elif entry.filename=='case-manifest.json':content=(json.dumps({'case':'private-library','sha256':pointer['sha256']})+'\n').encode()
                    after.writestr(entry,content)
            final=buffer.getvalue()
            if len(final)>deploy.MAX_ZIP:raise PrivateCaseError(stage)
            with zipfile.ZipFile(io.BytesIO(data))as before,zipfile.ZipFile(io.BytesIO(final))as after:
                if after.testzip()is not None or before.namelist()!=after.namelist():raise PrivateCaseError(stage)
                for name in before.namelist():
                    if name not in ('private/case.json','case-manifest.json')and before.read(name)!=after.read(name):raise PrivateCaseError(stage)
            with output.open('xb')as file:
                created_output=True
                output.chmod(0o600);file.write(final)
        return {'commit':commit,'sha256':hashlib.sha256(final).hexdigest(),'caseSha256':pointer['sha256'],'caseCount':pointer['caseCount'],'translationCount':pointer['translationCount']}
    except Exception:
        if created_output:
            try:output.unlink()
            except OSError:pass
        raise PrivateCaseError(stage)from None

def main():
    parser=argparse.ArgumentParser(description='Hydrate a tested SHIFT package from its pinned private library.')
    for key in ('artifact','commit','sha256','manifest','output'):parser.add_argument('--'+key,required=True)
    args=parser.parse_args()
    try:
        print(json.dumps(hydrate(args.artifact,args.commit,args.sha256,args.manifest,args.output)));return 0
    except PrivateCaseError as error:
        print(json.dumps({'event':'private_case_release_failed','stage':error.stage}));return 1

if __name__=='__main__':raise SystemExit(main())
