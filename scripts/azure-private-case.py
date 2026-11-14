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
import os
import pathlib
import re
import selectors
import signal
import subprocess
import tempfile
import time
import zipfile

ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('shift_deploy',ROOT/'scripts/azure-ci-deploy.py')
deploy=importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)
STAGES=frozenset(('pointer','artifact','container','metadata','download','integrity','schema','hydrate'))
MAX_CASE=2_000_000

REASONS=frozenset(('unknown','azure_authentication','azure_authorization','azure_not_found',
    'azure_precondition','http_unauthorized','http_forbidden','http_not_found','http_throttled',
    'http_service_error','network_error','cli_failed','cli_unavailable','cli_timeout',
    'cli_output_limit','cli_invalid_output','cli_command_rejected','container_public','unexpected_shape'))
MAX_CLI_OUTPUT=65536

class PrivateCaseError(Exception):
    def __init__(self,stage='unknown',reason='unknown'):
        self.stage=stage if isinstance(stage,str)and stage in STAGES else 'unknown'
        self.reason=reason if isinstance(reason,str)and reason in REASONS else 'unknown'
        super().__init__('Private case release unavailable; deployment stopped.')

class PrivateReadError(Exception):
    def __init__(self,reason='unknown'):
        self.reason=reason if isinstance(reason,str)and reason in REASONS else 'unknown'
        super().__init__('Private source read failed.')

def failure_diagnostic(error):
    known=type(error)is PrivateCaseError
    return {'event':'private_case_release_failed','stage':error.stage if known and isinstance(error.stage,str)and error.stage in STAGES else 'unknown',
            'reason':error.reason if known and isinstance(error.reason,str)and error.reason in REASONS else 'unknown'}

def classify_cli_failure(raw):
    # Recognised codes yield a fixed category, never the captured code/message/URL.
    text=raw[:MAX_CLI_OUTPUT].decode('utf-8',errors='ignore')
    groups={
        'azure_authentication':('AuthenticationFailed','InvalidAuthenticationInfo','ExpiredAuthenticationToken'),
        'azure_authorization':('AuthorizationPermissionMismatch','AuthorizationFailure','AuthorizationFailed'),
        'azure_not_found':('ContainerNotFound','BlobNotFound','ResourceNotFound'),
        'azure_precondition':('ConditionNotMet','TargetConditionNotMet')}
    for reason,codes in groups.items():
        for code in codes:
            if re.search(r'(?:ERROR:\s*\(|ErrorCode:\s*|"code"\s*:\s*")'+code+r'(?=[)"\s]|$)',text,re.I):return reason
    status=re.search(r'(?:Status\s*Code\s*:|HTTP/\d(?:\.\d)?\s+)\s*(401|403|404|429|500|502|503|504)\b',text,re.I)
    if status:return {'401':'http_unauthorized','403':'http_forbidden','404':'http_not_found','429':'http_throttled'}.get(status[1],'http_service_error')
    if re.search(r'\b(?:ServiceRequestError|ServiceResponseError|ConnectionError|NameResolutionError|SSLError|ProxyError)\b',text):return 'network_error'
    return 'cli_failed'

def capture_cli(argv,*,limit=MAX_CLI_OUTPUT,timeout=120):
    # Bound both pipes while draining: do not retain arbitrarily large captured errors.
    process=None;finished=False;deadline=time.monotonic()+timeout;out=[bytearray(),bytearray()]
    try:
        process=subprocess.Popen(argv,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
        with selectors.DefaultSelector()as selector:
            selector.register(process.stdout,selectors.EVENT_READ,0);selector.register(process.stderr,selectors.EVENT_READ,1)
            while selector.get_map():
                remaining=deadline-time.monotonic()
                if remaining<=0:raise PrivateReadError('cli_timeout')
                events=selector.select(remaining)
                if not events:raise PrivateReadError('cli_timeout')
                for key,_ in events:
                    chunk=os.read(key.fileobj.fileno(),8192)
                    if not chunk:selector.unregister(key.fileobj);continue
                    if sum(map(len,out))+len(chunk)>limit:raise PrivateReadError('cli_output_limit')
                    out[key.data].extend(chunk)
            result=process.wait(timeout=max(.001,deadline-time.monotonic()))
        finished=True;return result,bytes(out[0]),bytes(out[1])
    except FileNotFoundError:raise PrivateReadError('cli_unavailable')from None
    except subprocess.TimeoutExpired:raise PrivateReadError('cli_timeout')from None
    finally:
        if process is not None:
            if not finished:
                try:os.killpg(process.pid,signal.SIGKILL)
                except ProcessLookupError:pass
                process.wait()
            process.stdout.close();process.stderr.close()

def read_cli(args,*,capture=capture_cli):
    try:
        allowed={('storage','container','show'),('storage','blob','show'),('storage','blob','download')}
        if (tuple(args[:3])not in allowed or '--auth-mode'not in args or args[args.index('--auth-mode')+1]!='login'
            or any(flag in args for flag in ('--account-key','--connection-string','--sas-token','--blob-endpoint'))):raise PrivateReadError('cli_command_rejected')
        code,stdout,stderr=capture(['az',*args,'--only-show-errors'])
        if len(stdout)+len(stderr)>MAX_CLI_OUTPUT:raise PrivateReadError('cli_output_limit')
        if code:raise PrivateReadError(classify_cli_failure(stderr+b'\n'+stdout))
        try:return stdout.decode('utf-8')
        except UnicodeDecodeError:raise PrivateReadError('cli_invalid_output')from None
    except PrivateReadError:raise
    except Exception:raise PrivateReadError('unknown')from None

def require_private_container(raw):
    try:info=json.loads(raw)
    except Exception:raise PrivateCaseError('container','unexpected_shape')from None
    if not isinstance(info,dict)or 'publicAccess'not in info:raise PrivateCaseError('container','unexpected_shape')
    if info['publicAccess']in ('blob','container'):raise PrivateCaseError('container','container_public')
    if info['publicAccess']is not None:raise PrivateCaseError('container','unexpected_shape')

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

def hydrate(artifact,commit,digest,manifest,output,*,cli=read_cli,verify=verify_schema):
    stage='pointer';output=pathlib.Path(output);created_output=False
    try:
        pointer=pointer_from_file(manifest)
        stage='artifact';data=deploy.validate_artifact(artifact,commit,digest)
        if output.exists()or output.is_symlink():raise PrivateCaseError(stage)
        with zipfile.ZipFile(io.BytesIO(data))as archive:
            if not {'private/case.json','case-manifest.json','server/azure-index.mjs'}.issubset(archive.namelist()):raise PrivateCaseError(stage)
        blob='case-libraries/'+pointer['sha256']+'.json'
        stage='container'
        require_private_container(cli(['storage','container','show','--subscription',deploy.SUBSCRIPTION,'--account-name',deploy.ACCOUNT,'--name',deploy.CONTAINER,'--auth-mode','login','--query','properties','--output','json']))
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
    except Exception as error:
        if created_output:
            try:output.unlink()
            except OSError:pass
        reason=error.reason if type(error)in (PrivateCaseError,PrivateReadError)else 'unknown'
        raise PrivateCaseError(stage,reason)from None

def main():
    parser=argparse.ArgumentParser(description='Hydrate a tested SHIFT package from its pinned private library.')
    for key in ('artifact','commit','sha256','manifest','output'):parser.add_argument('--'+key,required=True)
    args=parser.parse_args()
    try:
        print(json.dumps(hydrate(args.artifact,args.commit,args.sha256,args.manifest,args.output)));return 0
    except PrivateCaseError as error:
        print(json.dumps(failure_diagnostic(error)));return 1

if __name__=='__main__':raise SystemExit(main())
