// Alternative private regional database; preview only until exact cross-region networking is approved.
targetScope = 'resourceGroup'
param location string = 'centralus'
param existingWebVnetName string = 'shift-vnet'
param existingPrivateDnsZoneName string = 'shift.private.postgres.database.azure.com'
param databaseAdminObjectId string
param databaseAdminPrincipalName string
@allowed(['', '1', '2', '3'])
param databaseAvailabilityZone string = ''
var suffix = uniqueString(subscription().subscriptionId, resourceGroup().id)
var tags = {project:'SHIFT',environment:'playtest',managedBy:'bicep'}
resource webNetwork 'Microsoft.Network/virtualNetworks@2024-05-01' existing = {
 name: existingWebVnetName
}
resource dns 'Microsoft.Network/privateDnsZones@2024-06-01' existing = {
 name: existingPrivateDnsZoneName
}
resource dbNetwork 'Microsoft.Network/virtualNetworks@2024-05-01' = {
 name: 'shift-db-central-vnet'
 location: location
 tags: tags
 properties: {
  addressSpace: {addressPrefixes:['10.88.0.0/16']}
  subnets: [{
   name:'database'
   properties: {
    addressPrefix:'10.88.2.0/28'
    delegations:[{name:'postgres',properties:{serviceName:'Microsoft.DBforPostgreSQL/flexibleServers'}}]
    serviceEndpoints:[{service:'Microsoft.Storage'}]
   }
  }]
 }
}
resource webToDb 'Microsoft.Network/virtualNetworks/virtualNetworkPeerings@2024-05-01' = {
 parent:webNetwork
 name:'shift-web-to-central-db'
 properties: {
  remoteVirtualNetwork:{id:dbNetwork.id}
  allowVirtualNetworkAccess:true
  allowForwardedTraffic:false
  allowGatewayTransit:false
  useRemoteGateways:false
 }
}
resource dbToWeb 'Microsoft.Network/virtualNetworks/virtualNetworkPeerings@2024-05-01' = {
 parent:dbNetwork
 name:'shift-central-db-to-web'
 properties: {
  remoteVirtualNetwork:{id:webNetwork.id}
  allowVirtualNetworkAccess:true
  allowForwardedTraffic:false
  allowGatewayTransit:false
  useRemoteGateways:false
 }
}
resource dnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
 parent:dns
 name:'shift-central-db-link'
 location:'global'
 properties:{registrationEnabled:false,virtualNetwork:{id:dbNetwork.id}}
}
resource pg 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
 name:'shift-pg-central-${suffix}'
 location:location
 tags:tags
 sku:{name:'Standard_B1ms',tier:'Burstable'}
 properties:{
  version:'16'
  availabilityZone:empty(databaseAvailabilityZone)?null:databaseAvailabilityZone
  authConfig:{passwordAuth:'Disabled',activeDirectoryAuth:'Enabled',tenantId:tenant().tenantId}
  backup:{backupRetentionDays:7,geoRedundantBackup:'Disabled'}
  highAvailability:{mode:'Disabled'}
  storage:{storageSizeGB:32,autoGrow:'Disabled',type:'Premium_LRS'}
  network:{publicNetworkAccess:'Disabled',delegatedSubnetResourceId:'${dbNetwork.id}/subnets/database',privateDnsZoneArmResourceId:dns.id}
 }
 dependsOn:[dnsLink,webToDb,dbToWeb]
}
resource admin 'Microsoft.DBforPostgreSQL/flexibleServers/administrators@2024-08-01' = {
 parent:pg
 name:databaseAdminObjectId
 properties:{principalName:databaseAdminPrincipalName,principalType:'User',tenantId:tenant().tenantId}
}
resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
 parent:pg
 name:'shift'
 properties:{charset:'UTF8',collation:'en_US.utf8'}
}
output postgresHost string = pg.properties.fullyQualifiedDomainName
output databaseVnetId string = dbNetwork.id
