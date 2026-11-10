#!/usr/bin/env bash
# Read-only ARM preview. The dedicated resource group must already exist.
set -euo pipefail
: "${SHIFT_SUBSCRIPTION:?Set explicit approved subscription UUID}"
: "${SHIFT_RESOURCE_GROUP:?Set dedicated existing resource group}"
: "${SHIFT_OPERATOR_CIDR:?Set operator IPv4 /32}"
: "${SHIFT_CASE_SHA256:?Set approved case artifact digest}"
: "${SHIFT_ADMIN_OBJECT_ID:?Set verified Entra user object UUID}"
: "${SHIFT_ADMIN_NAME:?Set verified Entra administrator principal name}"
export SHIFT_SUBSCRIPTION SHIFT_RESOURCE_GROUP SHIFT_OPERATOR_CIDR SHIFT_CASE_SHA256 SHIFT_ADMIN_OBJECT_ID SHIFT_ADMIN_NAME
python3 - <<'PY'
import ipaddress,os,re,uuid
for k in ['SHIFT_SUBSCRIPTION','SHIFT_ADMIN_OBJECT_ID']: uuid.UUID(os.environ[k])
n=ipaddress.ip_network(os.environ['SHIFT_OPERATOR_CIDR'],strict=True)
assert n.version==4 and n.prefixlen==32, 'Operator access must be one IPv4 /32'
assert re.fullmatch(r'[a-fA-F0-9]{64}',os.environ['SHIFT_CASE_SHA256']), 'Invalid SHA256'
assert re.fullmatch(r'rg-shift-[a-z0-9-]+',os.environ['SHIFT_RESOURCE_GROUP']), 'Use dedicated rg-shift-* group'
assert os.environ['SHIFT_ADMIN_NAME'] and '\n' not in os.environ['SHIFT_ADMIN_NAME'], 'Invalid principal name'
PY
location=$(az group show --subscription "$SHIFT_SUBSCRIPTION" --name "$SHIFT_RESOURCE_GROUP" --query location -o tsv)
if [[ "$location" != centralus ]]; then
  printf 'Expected approved Central US resource group, found %s\n' "$location" >&2; exit 1
fi
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
az deployment group what-if --subscription "$SHIFT_SUBSCRIPTION" \
  --resource-group "$SHIFT_RESOURCE_GROUP" --name shift-preview \
  --template-file "$here/main.bicep" --parameters \
  location=centralus operatorIpv4Cidr="$SHIFT_OPERATOR_CIDR" \
  caseSha256="$SHIFT_CASE_SHA256" databaseAdminObjectId="$SHIFT_ADMIN_OBJECT_ID" \
  databaseAdminPrincipalName="$SHIFT_ADMIN_NAME" allowPublicAccess=false allowNewRooms=false bootstrapMode=true
