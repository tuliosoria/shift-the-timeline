import datetime as dt
import hashlib
import importlib.util
import io
import json
import pathlib
import tempfile
import unittest
import urllib.parse
import zipfile

spec = importlib.util.spec_from_file_location('azure_ci', pathlib.Path(__file__).parents[1] / 'scripts/azure-ci-deploy.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class DeployTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = pathlib.Path(self.tmp.name) / 'app.zip'
        with zipfile.ZipFile(self.path, 'w') as z:
            z.writestr('server/azure-index.mjs', 'synthetic app')
        self.commit = 'a' * 40
        self.digest = hashlib.sha256(self.path.read_bytes()).hexdigest()
        self.now = dt.datetime(2026, 11, 10, tzinfo=dt.timezone.utc)
        self.calls, self.http_calls = [], []
        self.listing = []
        self.polls = [{'id': 'deploy-1', 'status': 4, 'complete': True}]
        self.accepted = {'id': 'deploy-1'}
        self.secret = 'synthetic-sensitive-value'

    def cli(self, args):
        self.calls.append(args)
        if args[:3] == ['storage', 'blob', 'list']:
            return json.dumps(self.listing)
        if args[:3] == ['storage', 'blob', 'upload']:
            snapshot = pathlib.Path(args[args.index('--file') + 1])
            self.assertEqual(hashlib.sha256(snapshot.read_bytes()).hexdigest(), self.digest)
            return ''
        if args[:3] == ['storage', 'blob', 'generate-sas']:
            expiry = args[args.index('--expiry') + 1]
            return urllib.parse.urlencode(dict(sp='r', sr='b', spr='https', se=expiry, sig=self.secret,
                                              skoid='identity', sktid='tenant', skt='start', ske='end', sks='b', skv='v'))
        if args[:2] == ['account', 'get-access-token']:
            return self.secret
        self.fail('Unexpected CLI operation')

    def http(self, method, token, body=None):
        self.http_calls.append((method, token, body))
        self.assertEqual(token, self.secret)
        return self.accepted if method == 'PUT' else self.polls.pop(0)

    def deploy(self, **kwargs):
        return m.deploy(self.path, self.commit, self.digest, cli=self.cli, http=self.http,
                        now=lambda: self.now, sleep=lambda _: None, release_http=lambda: {'commit': self.commit}, **kwargs)

    def test_success_exact_scope_immutable_artifact_and_secret_free_result(self):
        self.polls.insert(0, {'id': 'deploy-1', 'status': 1, 'complete': False})
        result = self.deploy()
        self.assertEqual(result, {'commit': self.commit, 'sha256': self.digest, 'status': 'deployment_complete'})
        self.assertNotIn(self.secret, json.dumps(result))
        for args in self.calls:
            self.assertIn(m.SUBSCRIPTION, args)
            self.assertNotIn(self.secret, args)
        upload = self.calls[1]
        self.assertEqual(upload[upload.index('--overwrite') + 1], 'false')
        self.assertEqual(upload[upload.index('--if-none-match') + 1], '*')
        self.assertEqual(upload[upload.index('--name') + 1], f'{self.commit}/{self.digest}.zip')
        body = self.http_calls[0][2]['properties']
        self.assertEqual(set(body), {'type', 'packageUri', 'clean', 'restart'})
        self.assertEqual((body['type'], body['clean'], body['restart']), ('zip', False, True))
        uri = urllib.parse.urlsplit(body['packageUri'])
        self.assertEqual(uri.hostname, m.ACCOUNT + '.blob.core.windows.net')
        fields = urllib.parse.parse_qs(uri.query)
        self.assertEqual(fields['se'], ['2026-11-10T00:15:00Z'])
        self.assertEqual(fields['sp'], ['r'])
        self.assertEqual(fields['sr'], ['b'])

    def test_bad_target_commit_digest_and_oversized_artifact_do_no_io(self):
        with self.assertRaises(m.DeploymentError):
            self.deploy(target=(*m.TARGET[:2], 'other-app', *m.TARGET[3:]))
        for commit, digest in [('HEAD', self.digest), (self.commit, 'f' * 64)]:
            with self.assertRaises(m.DeploymentError):
                m.deploy(self.path, commit, digest, cli=self.cli)
        self.path.write_bytes(b'x' * (m.MAX_ZIP + 1))
        with self.assertRaises(m.DeploymentError):
            self.deploy()
        self.assertEqual(self.calls, [])

    def test_unsafe_zip_rejected_before_network(self):
        for filename in ['../secret', '/absolute', 'C:/file', 'x\\file']:
            with zipfile.ZipFile(self.path, 'w') as z:
                z.writestr(filename, 'bad')
            self.digest = hashlib.sha256(self.path.read_bytes()).hexdigest()
            with self.assertRaises(m.DeploymentError):
                self.deploy()
        self.assertEqual(self.calls, [])

    def test_storage_guard_preserves_everything_and_rejects_pagination_or_overage(self):
        for listing in [[{'nextMarker': 'more'}], [{'properties': {'contentLength': m.MAX_STORED}}],
                        [{'properties': {'contentLength': -1}}], {'unexpected': []}]:
            self.calls.clear()
            self.listing = listing
            with self.assertRaises(m.DeploymentError):
                self.deploy()
            self.assertEqual(len(self.calls), 1)
        self.assertFalse(any('delete' in args for args in self.calls))

    def test_sas_rejects_write_permissions_and_wrong_expiry(self):
        original = self.cli
        def cli(args):
            value = original(args)
            if args[:3] == ['storage', 'blob', 'generate-sas']:
                return value.replace('sp=r', 'sp=rw')
            return value
        with self.assertRaises(m.DeploymentError):
            m.deploy(self.path, self.commit, self.digest, cli=cli, http=self.http, now=lambda: self.now)
        self.assertEqual(self.http_calls, [])

    def test_no_historical_or_untyped_success_accepted(self):
        for accepted in [{}, {'status': 4}, {'id': 'https://attacker'}]:
            self.accepted = accepted
            with self.assertRaises(m.DeploymentError):
                self.deploy()
        self.accepted = {'id': 'deploy-1'}
        for poll in [{'id': 'old', 'status': 4, 'complete': True},
                     {'id': 'deploy-1', 'status': 'Succeeded', 'complete': True},
                     {'id': 'deploy-1', 'status': 3, 'complete': True},
                     {'id': 'deploy-1', 'status': 4}, []]:
            self.polls = [poll]
            with self.assertRaises(m.DeploymentError):
                self.deploy()

    def test_deadline_stops_polling(self):
        times = iter([0, 601])
        with self.assertRaises(m.DeploymentError):
            self.deploy(clock=lambda: next(times))
        self.assertEqual(len(self.http_calls), 1)

    def test_cli_http_failures_hide_secret_text_and_do_not_retry_put(self):
        def broken(*args):
            raise ValueError(self.secret)
        with self.assertRaises(m.DeploymentError) as caught:
            m.deploy(self.path, self.commit, self.digest, cli=broken)
        self.assertNotIn(self.secret, str(caught.exception))
        with self.assertRaises(m.DeploymentError) as caught:
            m.deploy(self.path, self.commit, self.digest, cli=self.cli, http=broken, now=lambda: self.now)
        self.assertNotIn(self.secret, str(caught.exception))

    def test_release_verification_requires_exact_live_revision(self):
        responses = iter([{'commit': 'b' * 40}, {'commit': self.commit}])
        m.verify_release(self.commit, fetch=lambda: next(responses), sleep=lambda _: None)
        with self.assertRaises(m.DeploymentError):
            m.verify_release(self.commit, fetch=lambda: {'commit': 'b' * 40}, sleep=lambda _: None)
        with self.assertRaises(m.DeploymentError):
            m.verify_release(self.commit, fetch=lambda: {'commit': self.commit, 'extra': 'untrusted'}, sleep=lambda _: None)

    def test_http_transport_has_fixed_arm_url_and_rejects_redirect(self):
        self.assertEqual(urllib.parse.urlsplit(m.ARM).hostname, 'management.azure.com')
        self.assertIn('/extensions/onedeploy?api-version=2023-12-01', m.ARM)
        self.assertIsNone(m.NoRedirect().redirect_request(None, None, None, None, None, 'https://attacker'))


if __name__ == '__main__':
    unittest.main()
