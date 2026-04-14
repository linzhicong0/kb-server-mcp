---
title: "Database Schema and Migrations"
description: "Entity relationship model, migration strategy, indexing conventions, and query performance guidelines for PostgreSQL"
read_when:
  - Modifying database schema or adding new tables
  - Writing or reviewing database migrations
  - Debugging slow queries or adding indexes
  - Questions about data relationships or table structure
keywords:
  - database
  - schema
  - migration
  - postgresql
  - sql
  - index
  - table
  - query
  - performance
  - entity
  - relationship
  - orm
layer: database
---

# Database Schema and Migrations

## Core Tables

- `users` — user accounts with auth provider links
- `orders` — purchase orders with status tracking
- `products` — catalog items with pricing
- `categories` — product classification hierarchy

## Migration Strategy

1. All migrations are versioned and timestamped
2. Each migration has `up()` and `down()` (reversible)
3. Data migrations run after schema changes
4. Test with production-like data before deploying

## Indexing

- Index all foreign key columns
- Composite indexes for common filter combinations
- Use `EXPLAIN ANALYZE` to verify query plans
