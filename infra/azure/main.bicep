targetScope = 'resourceGroup'

@description('Use a dedicated development/playtest resource group. This template does not migrate live AWS data.')
param location string = resourceGroup().location

@minLength(3)
@maxLength(7)
@description('Lowercase project prefix. Names include a subscription/resource-group suffix.')
param prefix string = 'shift'

@description('The operator IPv4 CIDR allowed during initial staging (for example, a single /32). No broad default.')
param operatorIpv4Cidr string

@description('Only set true after cost, privacy and external-access approval and smoke testing.')
param allowPublicAccess bool = false

@description('Room admission is off until application/schema/case validation passes.')
param allowNewRooms bool = false

@description('Initial operator-only maintenance startup for private DB bootstrap; disable after migration.')
param bootstrapMode bool = false

@description('Pinned, server-only JSON case artifact path in the application package; never under public/.')
param caseFile string = '/home/site/wwwroot/private/case.json'

@minLength(64)
@maxLength(64)
@description('SHA-256 of the approved server-only case JSON, not a secret.')
param caseSha256 string

@description('Verified Entra object ID of the human deployment administrator. Not the app identity.')
param databaseAdminObjectId string

@description('Human Entra administrator display/login name for the selected tenant.')
param databaseAdminPrincipalName string

var suffix = uniqueString(subscription().subscriptionId, resourceGroup().id)
var appName = '${prefix}-${suffix}'
var databaseName = 'shift'
var appRole = 'shift_app'
var tags = {
  project: 'SHIFT'
  environment: 'playtest'
  managedBy: 'bicep'
}

resource network 'Microsoft.Network/virtualNetworks@2024-05-01' = {
  name: '${prefix}-vnet'
  location: location
  tags: tags
  properties: {
    addressSpace: { addressPrefixes: ['10.87.0.0/16'] }
    subnets: [
      {
        name: 'web'
        properties: {
          addressPrefix: '10.87.1.0/26'
          delegations: [{ name: 'web', properties: { serviceName: 'Microsoft.Web/serverFarms' } }]
        }
      }
      {
        name: 'database'
        properties: {
          addressPrefix: '10.87.2.0/28'
          delegations: [{ name: 'postgres', properties: { serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers' } }]
        }
      }
    ]
  }
}
var webSubnetId = '${network.id}/subnets/web'
var databaseSubnetId = '${network.id}/subnets/database'

resource databaseDns 'Microsoft.Network/privateDnsZones@2024-06-01' = {
  name: '${prefix}.private.postgres.database.azure.com'
  location: 'global'
  tags: tags
}
resource databaseDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  parent: databaseDns
  name: '${prefix}-link'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: { id: network.id }
  }
}
resource databaseServer 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: '${prefix}-pg-${suffix}'
  location: location
  tags: tags
  sku: { name: 'Standard_B1ms', tier: 'Burstable' }
  properties: {
    version: '16'
    authConfig: { passwordAuth: 'Disabled', activeDirectoryAuth: 'Enabled', tenantId: tenant().tenantId }
    backup: { backupRetentionDays: 7, geoRedundantBackup: 'Disabled' }
    highAvailability: { mode: 'Disabled' }
    storage: { storageSizeGB: 32, autoGrow: 'Disabled', type: 'Premium_LRS' }
    network: {
      publicNetworkAccess: 'Disabled'
      delegatedSubnetResourceId: databaseSubnetId
      privateDnsZoneArmResourceId: databaseDns.id
    }
  }
  dependsOn: [databaseDnsLink]
}
resource databaseAdministrator 'Microsoft.DBforPostgreSQL/flexibleServers/administrators@2024-08-01' = {
  parent: databaseServer
  name: databaseAdminObjectId
  properties: {
    principalName: databaseAdminPrincipalName
    principalType: 'User'
    tenantId: tenant().tenantId
  }
}
resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: databaseServer
  name: databaseName
  properties: { charset: 'UTF8', collation: 'en_US.utf8' }
}

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: '${prefix}-linux-plan'
  location: location
  tags: tags
  kind: 'linux'
  sku: { name: 'B1', tier: 'Basic', capacity: 1 }
  properties: { reserved: true }
}
resource app 'Microsoft.Web/sites@2023-12-01' = {
  name: appName
  location: location
  tags: tags
  kind: 'app,linux'
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    publicNetworkAccess: 'Enabled'
    virtualNetworkSubnetId: webSubnetId
    siteConfig: {
      linuxFxVersion: 'NODE|22-lts'
      appCommandLine: bootstrapMode ? 'node server/azure-bootstrap.mjs' : 'node server/azure-index.mjs'
      alwaysOn: true
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      scmMinTlsVersion: '1.2'
      http20Enabled: true
      scmIpSecurityRestrictionsUseMain: true
      ipSecurityRestrictionsDefaultAction: allowPublicAccess ? 'Allow' : 'Deny'
      ipSecurityRestrictions: [{ name: 'staging-operator', ipAddress: operatorIpv4Cidr, action: 'Allow', priority: 100 }]
    }
  }
}
resource scmBasic 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2023-12-01' = {
  parent: app
  name: 'scm'
  properties: { allow: false }
}
resource ftpBasic 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2023-12-01' = {
  parent: app
  name: 'ftp'
  properties: { allow: false }
}
resource settings 'Microsoft.Web/sites/config@2023-12-01' = {
  parent: app
  name: 'appsettings'
  properties: {
    NODE_ENV: 'production'
    HOST: '0.0.0.0'
    PORT: '8080'
    SHIFT_RUNTIME: 'azure'
    SHIFT_BOOTSTRAP_MODE: bootstrapMode ? 'operator-only' : 'disabled'
    SHIFT_ORIGIN: 'https://${app.properties.defaultHostName}'
    SHIFT_PG_HOST: databaseServer.properties.fullyQualifiedDomainName
    SHIFT_PG_PORT: '5432'
    SHIFT_PG_DATABASE: databaseName
    SHIFT_PG_USER: appRole
    SHIFT_CASE_FILE: caseFile
    SHIFT_CASE_SHA256: caseSha256
    SHIFT_ALLOW_NEW_ROOMS: string(allowNewRooms)
    SHIFT_AI_ENABLED: 'false'
  }
}
output webAppName string = app.name
output webOrigin string = 'https://${app.properties.defaultHostName}'
output postgresHost string = databaseServer.properties.fullyQualifiedDomainName
output managedIdentityObjectId string = app.identity.principalId
