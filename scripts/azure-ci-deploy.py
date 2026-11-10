#!/usr/bin/env python3
"""Inert until explicitly invoked after approved OIDC/IAM/storage setup.

ARM OneDeploy 2023-12-01 has an untyped public response schema. This client
supports ONLY an explicit deployment ID and matching Kudu status/complete record.
Unknown response shapes fail closed and require a reviewed integration update.
Never print captured CLI/HTTP data, exception text, tokens or package URLs.
"""
import argparse
import datetime as dt
import hashlib
import io
import json
import pathlib
import re
import stat
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile

SUBSCRIPTION = 'ddb0b48c-aa74-4420-bf1b-49a3f7eaa970'
GROUP = 'rg-shift-playtest-centralus'
APP = 'shift-zndzouh3e74wy'
ACCOUNT = 'shiftartzndzouh3e74wy'  # Proposed; provisioning/approval is a separate gate.
CONTAINER = 'releases'
TARGET = (SUBSCRIPTION, GROUP, APP, ACCOUNT, CONTAINER)
MAX_ZIP = 10 * 1024 * 1024
MAX_STORED = 1_000_000_000
ARM = f'https://management.azure.com/subscriptions/{SUBSCRIPTION}/resourceGroups/{GROUP}/providers/Microsoft.Web/sites/{APP}/extensions/onedeploy?api-version=2023-12-01'


class DeploymentError(Exception):
    """Fixed public diagnostic only; never retain a raw underlying exception."""


def fail():
    raise DeploymentError('Deployment failed closed; review the approved integration configuration.') from None


def run_cli(args):
    try:
        result = subprocess.run(['az', *args, '--only-show-errors'], capture_output=True,
                                check=False, timeout=120)
        if result.returncode or len(result.stdout) > 2_000_000:
            fail()
        return result.stdout.decode('utf-8')
    except Exception:
        fail()


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def arm_request(method, token, body=None):
    # No caller-supplied URL and no redirects: never forward the ARM bearer token.
    try:
        data = None if body is None else json.dumps(body).encode()
        request = urllib.request.Request(ARM, data=data, method=method, headers={
            'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
        with urllib.request.build_opener(NoRedirect).open(request, timeout=30) as response:
            raw = response.read(1_000_001)
            if response.status not in (200, 201, 202) or len(raw) > 1_000_000:
                fail()
            return json.loads(raw)
    except Exception:
        fail()


def release_request():
    # Public read-only revision check: never attach ARM authorization or SAS.
    try:
        request = urllib.request.Request(f'https://{APP}.azurewebsites.net/api/release',
                                         headers={'Cache-Control': 'no-cache'})
        with urllib.request.build_opener(NoRedirect).open(request, timeout=10) as response:
            raw = response.read(1001)
            if response.status != 200 or len(raw) > 1000:
                fail()
            return json.loads(raw)
    except Exception:
        fail()


def verify_release(commit, fetch=release_request, sleep=time.sleep, clock=time.monotonic):
    deadline = clock() + 120
    for _ in range(24):
        if clock() >= deadline:
            fail()
        try:
            response = fetch()
            if response == {'commit': commit}:
                return
        except Exception:
            pass  # App restart/readiness can briefly make this public GET unavailable.
        sleep(5)
    fail()


def validate_artifact(path, commit, digest):
    if not re.fullmatch(r'[0-9a-f]{40}', commit) or not re.fullmatch(r'[0-9a-f]{64}', digest):
        fail()
    try:
        with open(path, 'rb') as file:
            data = file.read(MAX_ZIP + 1)
        if not data or len(data) > MAX_ZIP or hashlib.sha256(data).hexdigest() != digest:
            fail()
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            entries = archive.infolist()
            if not entries or len(entries) > 2000 or sum(x.file_size for x in entries) > 64 * 1024 * 1024:
                fail()
            names = set()
            for entry in entries:
                parts = pathlib.PurePosixPath(entry.filename)
                if (entry.filename in names or '\\' in entry.filename or '\x00' in entry.filename
                        or parts.is_absolute() or '..' in parts.parts or ':' in entry.filename
                        or stat.S_ISLNK(entry.external_attr >> 16) or entry.flag_bits & 1):
                    fail()
                names.add(entry.filename)
            if archive.testzip() is not None:
                fail()
        return data
    except Exception:
        fail()


def storage_args():
    return ['--subscription', SUBSCRIPTION, '--account-name', ACCOUNT,
            '--container-name', CONTAINER, '--auth-mode', 'login']


def enforce_storage_guard(cli, incoming):
    # Preserve-only guard, NOT a quota: workflow concurrency must serialize releases.
    # Refuse pagination rather than silently undercount. No deletion/lifecycle calls.
    try:
        records = json.loads(cli(['storage', 'blob', 'list', *storage_args(),
                                  '--num-results', '5000', '--show-next-marker',
                                  '--include', 's', 'v', '--output', 'json']))
        if not isinstance(records, list) or len(records) >= 5000:
            fail()
        total = 0
        for record in records:
            if not isinstance(record, dict):
                fail()
            if 'nextMarker' in record:
                if record['nextMarker']:
                    fail()
                continue
            size = record['properties']['contentLength']
            if type(size) is not int or size < 0:
                fail()
            total += size
        if total + incoming > MAX_STORED:
            fail()
    except Exception:
        fail()


def sas_url(cli, blob, now):
    expiry = now + dt.timedelta(minutes=15)
    expiry_text = expiry.strftime('%Y-%m-%dT%H:%M:%SZ')
    sas = cli(['storage', 'blob', 'generate-sas', *storage_args(), '--name', blob,
               '--as-user', '--permissions', 'r', '--https-only', '--expiry', expiry_text,
               '--output', 'tsv']).strip()
    try:
        if not sas or sas.startswith('?') or any(c.isspace() for c in sas):
            fail()
        fields = urllib.parse.parse_qs(sas, strict_parsing=True)
        if any(len(v) != 1 for v in fields.values()):
            fail()
        for key, value in {'sp': 'r', 'sr': 'b', 'spr': 'https', 'se': expiry_text}.items():
            if fields.get(key) != [value]:
                fail()
        if any(key in fields for key in ('ss', 'srt', 'si')) or not all(fields.get(key) for key in ('sig', 'skoid', 'sktid', 'skt', 'ske', 'sks', 'skv')):
            fail()
        return f'https://{ACCOUNT}.blob.core.windows.net/{CONTAINER}/{blob}?{sas}'
    except Exception:
        fail()


def deployment_record(response):
    # Supported conservative profile only; never select a historical success.
    if not isinstance(response, dict):
        fail()
    record = response.get('properties', response)
    if not isinstance(record, dict):
        fail()
    ident = record.get('id')
    if not isinstance(ident, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', ident):
        fail()
    return record


def deploy(path, commit, digest, target=TARGET, *, cli=run_cli, http=arm_request,
           now=lambda: dt.datetime.now(dt.timezone.utc), sleep=time.sleep, clock=time.monotonic,
           release_http=release_request):
    # Validate all supplied targeting/input before any CLI/auth/network action.
    if tuple(target) != TARGET:
        fail()
    data = validate_artifact(path, commit, digest)
    try:
        enforce_storage_guard(cli, len(data))
        blob = f'{commit}/{digest}.zip'
        # Snapshot bytes used for hashing: caller cannot replace artifact between
        # validation and az upload. Temporary artifact contains no tokens/SAS.
        with tempfile.TemporaryDirectory(prefix='shift-release-') as directory:
            snapshot = pathlib.Path(directory) / 'release.zip'
            snapshot.write_bytes(data)
            snapshot.chmod(0o600)
            cli(['storage', 'blob', 'upload', *storage_args(), '--name', blob,
                 '--file', str(snapshot), '--overwrite', 'false', '--if-none-match', '*',
                 '--output', 'none'])
        uri = sas_url(cli, blob, now().replace(microsecond=0))
        token = cli(['account', 'get-access-token', '--subscription', SUBSCRIPTION,
                     '--resource', 'https://management.azure.com/', '--query', 'accessToken',
                     '--output', 'tsv']).strip()
        if not token or any(c.isspace() for c in token):
            fail()
        accepted = deployment_record(http('PUT', token, {'properties': {
            'type': 'zip', 'packageUri': uri, 'clean': False, 'restart': True}}))
        ident = accepted['id']
        deadline = clock() + 600
        for _ in range(120):
            if clock() >= deadline:
                fail()
            record = deployment_record(http('GET', token))
            if record['id'] != ident:
                fail()
            status, complete = record.get('status'), record.get('complete')
            if type(status) is not int or type(complete) is not bool:
                fail()
            if status == 4 and complete:
                verify_release(commit, fetch=release_http, sleep=sleep, clock=clock)
                return {'commit': commit, 'sha256': digest, 'status': 'deployment_complete'}
            if status not in (0, 1, 2) or complete:
                fail()
            sleep(5)
        fail()
    except Exception:
        fail()


def main():
    parser = argparse.ArgumentParser(description='Approved SHIFT release deployment only.')
    parser.add_argument('--artifact', required=True)
    parser.add_argument('--commit', required=True)
    parser.add_argument('--sha256', required=True)
    args = parser.parse_args()
    try:
        result = deploy(args.artifact, args.commit, args.sha256)
        print(json.dumps(result))
        return 0
    except Exception:
        print('Deployment failed closed. No credentials or remote diagnostics are printed.')
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
