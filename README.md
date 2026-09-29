# Klyro

Multi-channel outreach + CRM platform (MERN). Finds US/UK businesses, contacts them across channels, and turns replies into quotes, projects and payments. Managed from `admin.klyro.codes`.

See `IMPLEMENTATION_PLAN.md` for the full plan and `n8n/README.md` for automation workflows.

## Monorepo (npm workspaces)

| Package | Path | Purpose |
|---|---|---|
| `@klyro/shared` | `shared/` | Zod schemas, enums, design tokens |
| server | `server/` | Express API (`api.klyro.codes`) |
| web | `web/` | Public site + pitch pages (`klyro.codes`) |
| portal | `portal/` | Client portal (`app.klyro.codes`) |
| admin | `admin/` | Command center (`admin.klyro.codes`) |

## Develop

```bash
nvm use            # Node 20 (matches the VPS)
npm install
cp .env.example server/.env   # fill in values
npm test           # all workspaces
npm run lint
npm run dev:api    # start the API
```

Requires MongoDB (Atlas replica set — transactions are mandatory) and Redis.
