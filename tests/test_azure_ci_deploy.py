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
            self.assertEqual(args[args.index('--include') + 1], 'sv')
            self.assertNotIn('v', args)
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
                        now=lambda: self.now, sleep=lambda _: None, release_http=lambda: {'commit': self.commit}, health_http=lambda: True, **kwargs)

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

    def test_history_list_selects_only_exact_accepted_id_pending_then_success(self):
        history = [{'id': 'arm-resource-' + str(i), 'properties': {
            'id': 'historical-' + str(i), 'status': 4, 'complete': True, 'active': True}}
            for i in range(3)]
        self.polls = [
            {'value': history},  # Accepted operation has not propagated yet.
            {'value': history + [{'properties': {'id': 'deploy-1', 'status': 1, 'complete': False}}]},
            {'value': [{'properties': {'id': 'deploy-1', 'status': 4, 'complete': True}}] + history}
        ]
        self.assertEqual(self.deploy()['status'], 'deployment_complete')
        self.assertEqual(len(self.http_calls), 4)

    def test_wrong_id_history_never_counts_as_success(self):
        self.polls = [{'value': [{'properties': {'id': 'old', 'status': 4, 'complete': True}}]}]
        times = iter([0, 1, 601])
        with self.assertRaises(m.DeploymentError):
            self.deploy(clock=lambda: next(times))
        self.assertEqual(len(self.http_calls), 2)

    def test_history_malformed_and_duplicate_matches_fail_closed(self):
        good = {'properties': {'id': 'deploy-1', 'status': 4, 'complete': True}}
        for response in [{'value': {}}, {'value': [None]}, {'value': [{'id': 'deploy-1'}]},
                         {'value': [{'properties': {'id': 'https://unexpected'}}]},
                         {'value': [good, good]}]:
            with self.assertRaises(m.DeploymentError):
                m.polled_deployment(response, 'deploy-1')
        self.assertIsNone(m.polled_deployment({'value': []}, 'deploy-1'))

    def test_release_verification_requires_exact_live_revision(self):
        responses = iter([{'commit': 'b' * 40}, {'commit': self.commit}, {'commit': self.commit}])
        m.verify_release(self.commit, fetch=lambda: next(responses), health=lambda: True, sleep=lambda _: None)
        with self.assertRaises(m.DeploymentError):
            m.verify_release(self.commit, fetch=lambda: {'commit': 'b' * 40}, health=lambda: True, sleep=lambda _: None)
        with self.assertRaises(m.DeploymentError):
            m.verify_release(self.commit, fetch=lambda: {'commit': self.commit, 'extra': 'untrusted'}, health=lambda: True, sleep=lambda _: None)

    def test_empty_acceptance_verifies_revision_health_without_historical_fallback(self):
        self.accepted = None
        self.assertEqual(self.deploy()['status'], 'release_verified')
        self.assertEqual([x[0] for x in self.http_calls], ['PUT'])
        self.assertEqual(len(self.polls), 1)  # Historical GET success was never inspected.
        self.http_calls.clear()
        with self.assertRaises(m.DeploymentError):
            m.deploy(self.path, self.commit, self.digest, cli=self.cli, http=self.http,
                     now=lambda: self.now, sleep=lambda _: None,
                     release_http=lambda: {'commit': 'b' * 40}, health_http=lambda: True)
        self.assertEqual([x[0] for x in self.http_calls], ['PUT'])

    def test_revision_requires_two_consecutive_healthy_probes(self):
        probes = iter([True, False, True, True])
        sleeps = []
        m.verify_release(self.commit, fetch=lambda: {'commit': self.commit},
                         health=lambda: next(probes), sleep=sleeps.append)
        self.assertEqual(sleeps, [5, 5, 5])
        with self.assertRaises(m.DeploymentError):
            m.verify_release(self.commit, fetch=lambda: {'commit': self.commit},
                             health=lambda: False, sleep=lambda _: None)

    def test_error_body_never_counts_as_acceptance(self):
        for body in [{'error': {'message': self.secret}}, {'id': 'deploy-1', 'error': {}},
                     {'properties': {'provisioningState': 'Failed'}},
                     {'id': 'deploy-1', 'status': 3},
                     {'id': 'deploy-1', 'status': 'Failed'},
                     {'properties': {'error': {'message': self.secret}}},
                     {'statusCode': 403}, {'success': False}, []]:
            self.accepted = body
            with self.assertRaises(m.DeploymentError):
                self.deploy()

    def test_transport_accepts_empty_202_only_as_none_and_rejects_other_statuses(self):
        from unittest.mock import patch
        class Response:
            status = 202
            body = b''
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, limit): return self.body
        class Opener:
            def open(self, *args, **kwargs): return response
        response = Response()
        with patch.object(m.urllib.request, 'build_opener', return_value=Opener()):
            self.assertIsNone(m.arm_request('PUT', self.secret, {}))
            for body in [b'null', b'false', b'42', b'"accepted"', b'[]']:
                response.body = body
                with self.assertRaises(m.DeploymentError):
                    m.arm_request('PUT', self.secret, {})
            response.body = b''
            response.status = 403
            with self.assertRaises(m.DeploymentError):
                m.arm_request('PUT', self.secret, {})
            response.status = 200
            with self.assertRaises(m.DeploymentError):
                m.arm_request('GET', self.secret)

    def test_opaque_accepted_metadata_requires_live_proof_never_follows_urls(self):
        for body in [{}, {'status': 'Accepted'}, {'opaque': {'url': 'https://attacker'}},
                     {'id': '/subscriptions/resource/path', 'properties': {'id': '/nested/resource/path'}},
                     {'id': 'https://attacker', 'location': 'https://attacker'}]:
            self.accepted = body
            self.http_calls.clear()
            self.assertEqual(self.deploy()['status'], 'release_verified')
            self.assertEqual([x[0] for x in self.http_calls], ['PUT'])
            self.http_calls.clear()
            with self.assertRaises(m.DeploymentError):
                m.deploy(self.path, self.commit, self.digest, cli=self.cli, http=self.http,
                         now=lambda: self.now, sleep=lambda _: None,
                         release_http=lambda: {'commit': 'b' * 40}, health_http=lambda: True)
            self.assertEqual([x[0] for x in self.http_calls], ['PUT'])

    def test_valid_id_failed_poll_never_downgrades_to_revision_proof(self):
        self.accepted = {'id': '/arm/resource', 'properties': {'id': 'deploy-1'}}
        self.polls = [{'id': 'deploy-1', 'status': 3, 'complete': True}]
        with self.assertRaises(m.DeploymentError):
            self.deploy()
        self.assertEqual([x[0] for x in self.http_calls], ['PUT', 'GET'])

    def test_fixed_stage_diagnostics_never_include_injected_secret_errors(self):
        prefixes = {'storage_guard': ['storage', 'blob', 'list'],
                    'upload': ['storage', 'blob', 'upload'],
                    'sas': ['storage', 'blob', 'generate-sas'],
                    'token': ['account', 'get-access-token']}
        for stage in ('artifact', 'storage_guard', 'upload', 'sas', 'token', 'submit', 'poll', 'release'):
            with self.subTest(stage=stage):
                def cli(args):
                    prefix = prefixes.get(stage)
                    if prefix and args[:len(prefix)] == prefix:
                        raise RuntimeError(self.secret)
                    return self.cli(args)
                def http(method, token, body=None):
                    if (stage == 'submit' and method == 'PUT') or (stage == 'poll' and method == 'GET'):
                        raise RuntimeError(self.secret)
                    return {'id': 'deploy-1'} if method == 'PUT' else {'id': 'deploy-1', 'status': 4, 'complete': True}
                def release():
                    if stage == 'release':
                        raise RuntimeError(self.secret)
                    return {'commit': self.commit}
                with self.assertRaises(m.DeploymentError) as caught:
                    m.deploy(self.path, 'bad' if stage == 'artifact' else self.commit, self.digest,
                             cli=cli, http=http, now=lambda: self.now, sleep=lambda _: None,
                             release_http=release, health_http=lambda: True)
                self.assertEqual(m.failure_diagnostic(caught.exception), {'event': 'azure_deploy_failed', 'stage': stage})
                self.assertNotIn(self.secret, json.dumps(m.failure_diagnostic(caught.exception)))
                self.assertNotIn(self.secret, str(caught.exception))
        self.assertEqual(m.failure_diagnostic(RuntimeError(self.secret))['stage'], 'unknown')
        forged = m.DeploymentError('submit')
        forged.stage = self.secret
        self.assertEqual(m.failure_diagnostic(forged)['stage'], 'unknown')
        forged.stage = []
        self.assertEqual(m.failure_diagnostic(forged)['stage'], 'unknown')

    def test_http_transport_has_fixed_arm_url_and_rejects_redirect(self):
        self.assertEqual(urllib.parse.urlsplit(m.ARM).hostname, 'management.azure.com')
        self.assertIn('/extensions/onedeploy?api-version=2023-12-01', m.ARM)
        self.assertIsNone(m.NoRedirect().redirect_request(None, None, None, None, None, 'https://attacker'))


if __name__ == '__main__':
    unittest.main()
