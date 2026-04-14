---
title: "CI/CD Pipeline (GitHub Actions)"
description: "Build, test, and deploy workflows using GitHub Actions including environment promotion, rollback procedures, and secrets management"
read_when:
  - Setting up or modifying CI/CD pipelines
  - Debugging build failures or deployment issues
  - Questions about environment variables or secrets
  - Configuring automated testing or code quality gates
keywords:
  - ci
  - cd
  - pipeline
  - github-actions
  - deploy
  - build
  - test
  - workflow
  - release
  - staging
  - production
  - rollback
layer: devops
---

# CI/CD Pipeline (GitHub Actions)

## Workflow Structure

```
Push → Lint → Type Check → Unit Tests → Integration Tests → Deploy Staging → Deploy Production
```

## Environments

| Environment | Branch      | Auto-deploy | Approval   |
| ----------- | ----------- | ----------- | ---------- |
| Development | `develop`   | Yes         | None       |
| Staging     | `release/*` | Yes         | None       |
| Production  | `main`      | Yes         | 1 reviewer |

## Secrets Management

- Repository secrets for API keys and credentials
- Environment secrets for deployment-specific values
- Never log secrets — use `::add-mask::` in workflows

## Rollback

1. Re-run the previous successful deployment workflow
2. Or revert the commit and push to trigger auto-deploy
3. Database rollbacks require manual migration reversal
