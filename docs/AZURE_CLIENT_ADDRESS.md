# Azure client-address attribution

The Azure entry point alone opts into `azureClientAddress`. Azure App Service documents that its front end overwrites the `CLIENT-IP` request header: https://github.com/Azure/app-service-linux-docs/blob/master/Things_You_Should_Know/headers.md . This deployment contract, not a private-address heuristic or cryptographic socket authentication, is the trust boundary. Keep the application behind that front end; do not reuse this adapter for arbitrary proxies or directly exposed Node servers.

Only one literal IPv4 or IPv6 header is accepted. Duplicate fields, comma-separated lists, whitespace, zone identifiers and port-bearing forms fall back to the socket address. IPv6 is canonicalized and IPv4-mapped IPv6 shares the IPv4 bucket. No `X-Forwarded-For`, `X-Client-IP` or other forwarding header is trusted. Missing or malformed headers retain conservative shared-proxy limiting. Default/local HTTP servers continue to ignore CLIENT-IP.

All existing global, room-creation and join limits remain unchanged. Correct client attribution avoids unfairly grouping unrelated players behind the App Service proxy, but actual shared NAT users still share an address budget. IP limits are abuse controls, not player authentication; session and room authorization remain separate.

Unit and HTTP-boundary tests cover parser behavior and adapter wiring. They do not prove live Azure header rewriting. Current public endpoints deliberately do not echo headers. No public diagnostic endpoint or ingress change is introduced. Before moving this code behind another proxy or allowing direct container access, re-evaluate this contract rather than trusting new forwarding headers.
