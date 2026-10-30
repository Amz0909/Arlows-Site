# Arlow website

Public site: `public/`. Server code (admin API, content API, image route): `functions/`. Database schema: `database/schema.sql`.

## Cloudflare Pages settings
- Framework preset: None
- Build command: (leave empty)
- Build output directory: `public`
- Root directory: (leave empty)

## Database binding (Settings > Bindings)
- D1 database, variable name exactly `DB`

## Secrets (Settings > Variables and Secrets, type Secret)
- `ADMIN_PASSWORD` (12+ characters)
- `SESSION_SECRET` (32+ random characters)

Never commit passwords or secrets to this repository.
