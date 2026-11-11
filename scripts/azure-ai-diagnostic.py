#!/usr/bin/env python3
"""Read-only diagnosis using the existing, authenticated deployment identity.

Never print CLI output/errors, credentials, secret references, URLs or unknown values.
No credential creation, configuration writes, permission changes or inference calls.
"""
import json
import math
import subprocess

SUBSCRIPTION = 'ddb0b48c-aa74-4420-bf1b-49a3f7eaa970'
GROUP = 'rg-shift-playtest-centralus'
APP = 'shift-zndzouh3e74wy'
POLICY_KEYS = ('model', 'inputRate', 'outputRate', 'inputTokens', 'outputTokens',
               'roomMicroUsd', 'dayMicroUsd', 'monthMicroUsd', 'maxConcurrent', 'uncapped')


def reject_constant(_):
    raise ValueError('invalid')


def summarise(raw):
    if not isinstance(raw, list) or any(not isinstance(row, dict) for row in raw):
        raise ValueError('invalid')
    settings = {}
    for row in raw:
        key, value = row.get('name'), row.get('value')
        if not isinstance(key, str) or not isinstance(value, str) or key in settings:
            raise ValueError('invalid')
        settings[key] = value
    result = {'event': 'azure_ai_diagnostic', 'status': 'read', 'settings': {}}
    for key in ('SHIFT_AI_ENABLED', 'SHIFT_AI_OPERATOR_CONSENT', 'SHIFT_ALLOW_NEW_ROOMS'):
        value = settings.get(key)
        result['settings'][key] = value if value in ('true', 'false') else 'missing_or_invalid'
    key = settings.get('OPENAI_API_KEY')
    result['credential'] = ('absent' if not key else
                            'key_vault_reference' if key.startswith('@Microsoft.KeyVault(') else
                            'present_value_not_disclosed')
    try:
        policy = json.loads(settings.get('SHIFT_AI_POLICY', ''), parse_constant=reject_constant)
    except (ValueError, TypeError):
        policy = None
    if not isinstance(policy, dict) or not set(policy).issubset(POLICY_KEYS):
        result['policy'] = 'missing_or_invalid'
        return result
    clean = {}
    for key, value in policy.items():
        if key == 'model':
            clean[key] = 'gpt-6-luna' if value == 'gpt-6-luna' else 'other_or_invalid_not_disclosed'
        elif key == 'uncapped':
            clean[key] = value if type(value) is bool else 'invalid'
        elif key.endswith('MicroUsd') and value is None:
            clean[key] = None
        elif type(value) in (int, float) and math.isfinite(value) and 0 <= value <= 1_000_000_000:
            clean[key] = value
        else:
            clean[key] = 'invalid'
    result['policy'] = clean
    return result


def diagnose(run=subprocess.run):
    try:
        response = run(['az', 'webapp', 'config', 'appsettings', 'list',
                        '--subscription', SUBSCRIPTION, '--resource-group', GROUP,
                        '--name', APP, '--output', 'json', '--only-show-errors'],
                       capture_output=True, check=False, timeout=90)
        if response.returncode or len(response.stdout) > 1_000_000:
            raise ValueError('unavailable')
        return summarise(json.loads(response.stdout))
    except Exception:
        # A denied read is a diagnostic outcome, never a reason to grant permissions or retry.
        return {'event': 'azure_ai_diagnostic', 'status': 'unavailable'}


if __name__ == '__main__':
    print(json.dumps(diagnose(), separators=(',', ':'), allow_nan=False))
