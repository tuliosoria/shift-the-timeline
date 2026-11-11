import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import unittest

spec = importlib.util.spec_from_file_location('diagnostic', Path(__file__).resolve().parents[1] / 'scripts' / 'azure-ai-diagnostic.py')
d = importlib.util.module_from_spec(spec)
spec.loader.exec_module(d)

class DiagnosticTests(unittest.TestCase):
    def test_allowlist_redacts_key_references_unrelated_settings_and_unknown_model(self):
        raw = [{'name': 'OPENAI_API_KEY', 'value': '@Microsoft.KeyVault(SecretUri=SECRET)'},
               {'name': 'PRIVATE', 'value': 'SECRET'},
               {'name': 'SHIFT_AI_ENABLED', 'value': 'true'},
               {'name': 'SHIFT_AI_OPERATOR_CONSENT', 'value': 'SECRET'},
               {'name': 'SHIFT_AI_POLICY', 'value': json.dumps({'model':'SECRET', 'inputRate':.1, 'outputRate':.5, 'inputTokens':2500, 'outputTokens':350, 'uncapped':True, 'roomMicroUsd':None, 'maxConcurrent':2})}]
        result = d.summarise(raw)
        self.assertNotIn('SECRET', json.dumps(result))
        self.assertEqual(result['credential'], 'key_vault_reference')
        self.assertEqual(result['policy']['inputTokens'], 2500)
        self.assertEqual(result['settings']['SHIFT_AI_ENABLED'], 'true')
        self.assertIsNone(result['policy']['roomMicroUsd'])
    def test_reads_only_exact_app_with_explicit_subscription(self):
        calls=[]
        def run(args, **kw):
            calls.append(args)
            self.assertTrue(kw['capture_output'])
            self.assertEqual(kw['timeout'],90)
            return SimpleNamespace(returncode=0, stdout=b'[]', stderr=b'SECRET')
        self.assertEqual(d.diagnose(run)['status'],'read')
        self.assertEqual(calls, [['az','webapp','config','appsettings','list','--subscription',d.SUBSCRIPTION,'--resource-group',d.GROUP,'--name',d.APP,'--output','json','--only-show-errors']])
    def test_denied_malformed_oversized_and_timeout_do_not_echo_or_retry(self):
        for code, raw in [(1,b'SECRET'),(0,b'SECRET'),(0,b'x'*1000001),(0,b'{"SECRET":"SECRET"}')]:
            calls=[]
            def run(*args, **kw):
                calls.append(args)
                return SimpleNamespace(returncode=code,stdout=raw,stderr=b'SECRET')
            self.assertEqual(d.diagnose(run),{'event':'azure_ai_diagnostic','status':'unavailable'})
            self.assertEqual(len(calls),1)
        def fail(*args, **kw): raise RuntimeError('SECRET')
        self.assertEqual(d.diagnose(fail)['status'],'unavailable')
    def test_unknown_policy_keys_bad_values_and_duplicate_settings_are_closed(self):
        for p in ['SECRET','[]','{"key":"SECRET"}','{"roomMicroUsd":NaN}','{"inputRate":Infinity}']:
            self.assertEqual(d.summarise([{'name':'SHIFT_AI_POLICY','value':p}])['policy'],'missing_or_invalid')
        r=d.summarise([{'name':'SHIFT_AI_POLICY','value':'{"inputRate":"SECRET","outputRate":true,"model":"gpt-6-luna"}'}])
        self.assertEqual(r['policy'],{'inputRate':'invalid','outputRate':'invalid','model':'gpt-6-luna'})
        with self.assertRaises(ValueError):d.summarise([{'name':'X','value':'a'},{'name':'X','value':'b'}])
    def test_plain_credentials_are_never_output(self):
        r=d.summarise([{'name':'OPENAI_API_KEY','value':'SECRET'}])
        self.assertEqual(r['credential'],'present_value_not_disclosed')
        self.assertNotIn('SECRET',json.dumps(r))

if __name__=='__main__': unittest.main()
