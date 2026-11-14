import importlib.util
import json
import pathlib
import subprocess
import sys
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('private_diagnostics',pathlib.Path(__file__).parents[1]/'scripts/azure-private-case.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
SECRET='TOKEN_SENTINEL SAS_SENTINEL PRIVATE_CASE_SENTINEL'

class PrivateDiagnosticsTests(unittest.TestCase):
    def args(self):return ['storage','container','show','--subscription',m.deploy.SUBSCRIPTION,'--account-name',m.deploy.ACCOUNT,'--name',m.deploy.CONTAINER,'--auth-mode','login','--query','properties','--output','json']
    def test_known_azure_codes_and_http_statuses_map_only_to_fixed_reasons(self):
        examples=[('ERROR: (AuthenticationFailed)','azure_authentication'),('ErrorCode:InvalidAuthenticationInfo','azure_authentication'),('ERROR: (AuthorizationPermissionMismatch)','azure_authorization'),('ErrorCode:AuthorizationFailure','azure_authorization'),('ERROR: (ContainerNotFound)','azure_not_found'),('ErrorCode:BlobNotFound','azure_not_found'),('ERROR: (ConditionNotMet)','azure_precondition'),('StatusCode: 401','http_unauthorized'),('HTTP/1.1 403 Forbidden','http_forbidden'),('Status Code: 404','http_not_found'),('StatusCode: 429','http_throttled'),('HTTP/1.1 503','http_service_error'),('ServiceRequestError: connection failed','network_error'),('UnrecognisedCode: '+SECRET,'cli_failed')]
        for raw,expected in examples:
            with self.subTest(raw=raw):self.assertEqual(m.classify_cli_failure((raw+' '+SECRET).encode()),expected)
    def test_read_runner_preserves_exact_arguments_and_hides_failure_text(self):
        args=self.args();calls=[]
        def capture(argv):calls.append(argv);return 1,b'',('ERROR: (AuthorizationPermissionMismatch) '+SECRET).encode()
        with self.assertRaises(m.PrivateReadError)as cm:m.read_cli(args,capture=capture)
        self.assertEqual(cm.exception.reason,'azure_authorization');self.assertNotIn(SECRET,str(cm.exception));self.assertEqual(calls,[['az',*args,'--only-show-errors']])
        self.assertEqual(m.read_cli(args,capture=lambda argv:(0,b'{"publicAccess":null}',SECRET.encode())),'{"publicAccess":null}')
    def test_runner_rejects_non_read_command_before_execution_and_unknown_errors_are_sanitised(self):
        def forbidden(argv):self.fail('No process may start')
        with self.assertRaises(m.PrivateReadError):m.read_cli(['storage','blob','upload'],capture=forbidden)
        def broken(argv):raise RuntimeError(SECRET)
        with self.assertRaises(m.PrivateReadError)as cm:m.read_cli(self.args(),capture=broken)
        self.assertEqual(cm.exception.reason,'unknown');self.assertNotIn(SECRET,str(cm.exception))
        with self.assertRaises(m.PrivateReadError)as cm:m.read_cli(self.args(),capture=lambda argv:(0,b'\xff',b''))
        self.assertEqual(cm.exception.reason,'cli_invalid_output')
    def test_explicit_null_is_required_and_public_or_unexpected_container_shapes_remain_closed(self):
        m.require_private_container('{"etag":"synthetic","publicAccess":null}')
        for raw,reason in [('{}','unexpected_shape'),('null','unexpected_shape'),('[]','unexpected_shape'),('{"publicAccess":"off"}','unexpected_shape'),('{"publicAccess":false}','unexpected_shape'),('{"publicAccess":"PRIVATE_CASE_SENTINEL"}','unexpected_shape'),('{"publicAccess":"blob"}','container_public'),('{"publicAccess":"container"}','container_public'),(SECRET,'unexpected_shape')]:
            with self.subTest(raw=raw),self.assertRaises(m.PrivateCaseError)as cm:m.require_private_container(raw)
            self.assertEqual(cm.exception.reason,reason);self.assertNotIn(SECRET,str(cm.exception))
    def test_diagnostic_never_echoes_arbitrary_stage_reason_or_exception(self):
        for error in [RuntimeError(SECRET),m.PrivateCaseError(SECRET,SECRET),m.PrivateCaseError({},[]) ]:self.assertEqual(m.failure_diagnostic(error),{'event':'private_case_release_failed','stage':'unknown','reason':'unknown'})
        self.assertEqual(m.failure_diagnostic(m.PrivateCaseError('container','azure_authorization')),{'event':'private_case_release_failed','stage':'container','reason':'azure_authorization'})
    def test_capture_bounds_both_output_streams_and_timeout_without_echoing(self):
        code='import sys;sys.stdout.buffer.write(b"ok");sys.stderr.buffer.write(b"hidden")'
        self.assertEqual(m.capture_cli([sys.executable,'-c',code]),(0,b'ok',b'hidden'))
        for stream in ('stdout','stderr'):
            with self.subTest(stream=stream),self.assertRaises(m.PrivateReadError)as cm:m.capture_cli([sys.executable,'-c',f'import sys;sys.{stream}.write("x"*4096)'],limit=100)
            self.assertEqual(cm.exception.reason,'cli_output_limit')
        with self.assertRaises(m.PrivateReadError)as cm:m.capture_cli([sys.executable,'-c','import time;time.sleep(5)'],timeout=.05)
        self.assertEqual(cm.exception.reason,'cli_timeout')
        with self.assertRaises(m.PrivateReadError)as cm:m.capture_cli(['/nonexistent/synthetic-az'])
        self.assertEqual(cm.exception.reason,'cli_unavailable')

if __name__=='__main__':unittest.main()
