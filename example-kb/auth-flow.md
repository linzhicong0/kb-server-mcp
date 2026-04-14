---
title: "OAuth2 Authentication Flow"
description: "Complete OAuth2 + JWT authentication pipeline including token refresh, scope validation, and error handling for third-party providers"
read_when:
  - User asks about login, sign-in, or authentication setup
  - Debugging auth errors, token expiry, or session issues
  - Configuring OAuth providers such as Google, GitHub, or custom SSO
  - Questions about user session management or access tokens
keywords:
  - login
  - authentication
  - oauth
  - oauth2
  - jwt
  - token
  - sso
  - sign-in
  - session
  - refresh-token
  - access-token
  - provider
  - google
  - github
layer: tech
---

# OAuth2 Authentication Flow

## Overview

Our auth system uses OAuth2 with JWT tokens. The flow supports multiple
third-party providers (Google, GitHub, custom SAML/OIDC) with automatic
token refresh and scope validation.

## Architecture

```
Client → Auth Gateway → OAuth Provider → Token Service → User Session
```

## Token Lifecycle

1. **Authorization Code** — obtained from OAuth provider redirect
2. **Access Token** — short-lived (1 hour), used for API calls
3. **Refresh Token** — long-lived (30 days), stored encrypted in DB
4. **ID Token** — contains user claims (email, name, avatar)

## Error Codes

| Code | Meaning | Resolution |
|------|---------|------------|
| `AUTH_EXPIRED` | Access token expired | Use refresh token |
| `AUTH_INVALID` | Malformed or revoked token | Re-authenticate |
| `AUTH_SCOPE` | Insufficient permissions | Request additional scopes |

## Adding a New Provider

1. Register OAuth app with the provider
2. Add client ID/secret to environment config
3. Create provider adapter implementing `OAuthProvider` interface
4. Add provider to the auth gateway routing table
5. Update the frontend login page with provider button

## Security Considerations

- All tokens transmitted over HTTPS only
- Refresh tokens are encrypted at rest (AES-256-GCM)
- Rate limiting on token refresh endpoint (5 requests/minute)
- PKCE required for all public clients
