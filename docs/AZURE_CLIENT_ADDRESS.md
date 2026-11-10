# Azure client-address attribution

The Azure entry point alone opts into `azureClientAddress`. Azure App Service documents that its front end overwrites the `CLIENT-IP` request header: https://github.com/Azure/app-service-linux-docs/blob/master/Things_You_Should_Know/headers.md . This deployment contract, not a private-address heuristic or cryptographic socket authentication, is the trust boundary. Keep the application behind that front end; do not reuse this adapter for arbitrary proxies or directly exposed Node servers.

Only one literal IPv4 or IPv6 header is accepted, optionally in strict IPv4:port or bracketed [IPv6]:port form with a decimal port from 1 through 65535. Ports are discarded before quota attribution. An unbracketed valid IPv6 literal is never split heuristically. Duplicate fields, comma-separated lists, whitespace, zone identifiers and malformed endpoint forms fall back to the socket address. IPv6 is canonicalized and IPv4-mapped IPv6 shares the IPv4 bucket. No `X-Forwarded-For`, `X-Client-IP` or other forwarding header is trusted. Missing or malformed headers retain conservative shared-proxy limiting. Default/local HTTP servers continue to ignore CLIENT-IP.

All existing global, room-creation and join limits remain unchanged. Correct client attribution avoids unfairly grouping unrelated players behind the App Service proxy, but actual shared NAT users still share an address budget. IP limits are abuse controls, not player authentication; session and room authorization remain separate.

Unit and HTTP-boundary tests cover parser behavior and adapter wiring. They do not prove live Azure header rewriting. Current public endpoints deliberately do not echo headers. No public diagnostic endpoint or ingress change is introduced. Before moving this code behind another proxy or allowing direct container access, re-evaluate this contract rather than trusting new forwarding headers.

## Endpoint-format compatibility

A community observation in [Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/819540/documentation-on-x-client-ip-http-header) shows an IPv4:port CLIENT-IP value. This observation supports narrow format compatibility, not a guarantee of the format on our deployment. Bracketed IPv6 endpoints are accepted unambiguously; plain IP literals remain supported. The Microsoft App Service overwrite contract remains the trust basis. Tests verify parsing and port-independent quota identity, not live header rewriting or the format currently emitted by our front end.
