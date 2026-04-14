---
title: "REST API Design Conventions"
description: "Standards for REST API endpoint design including URL patterns, error responses, pagination, versioning, and rate limiting"
read_when:
  - Creating new API endpoints or modifying existing ones
  - Reviewing API-related pull requests
  - Questions about API versioning or backward compatibility
  - Designing request/response schemas
keywords:
  - api
  - rest
  - endpoint
  - http
  - status-code
  - pagination
  - versioning
  - rate-limit
  - crud
  - request
  - response
  - json
layer: tech
---

# REST API Design Conventions

## URL Patterns

- Use plural nouns: `/users`, `/orders`, `/products`
- Nested resources: `/users/{id}/orders`
- Actions as verbs: `/users/{id}/activate`
- Query params for filtering: `/users?role=admin&status=active`

## HTTP Methods

| Method | Purpose          | Idempotent |
| ------ | ---------------- | ---------- |
| GET    | Read resource(s) | Yes        |
| POST   | Create resource  | No         |
| PUT    | Full update      | Yes        |
| PATCH  | Partial update   | No         |
| DELETE | Remove resource  | Yes        |

## Error Response Format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable message",
    "details": [
      { "field": "email", "message": "Invalid email format" }
    ]
  }
}
```

## Pagination

Use cursor-based pagination for large collections:

```
GET /users?cursor=abc123&limit=20

Response:
{
  "data": [...],
  "pagination": {
    "next_cursor": "def456",
    "has_more": true
  }
}
```

## Versioning

- URL-based: `/v1/users`, `/v2/users`
- New version only when breaking changes are needed
- Maintain at most 2 active versions simultaneously
