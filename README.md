# Pinewood Derby 2027

Registration website for the Ankeny Girl Scouts Pinewood Derby on January 9, 2027.

## Overview

Server-rendered Hono TSX and HTMX 4, with TypeScript Azure Functions and Cosmos DB. Families register racers and save private confirmation links. Organizers manage the roster and export it for DerbyNet.

Public navigation uses HTMX boosting and preloading. Public registration opens December 4, 2026 at midnight Central and closes January 4, 2027 at midnight Central; participant data expires February 8, 2027. Organizers can add racers outside the public registration window. Event details and dates live in `src/event.ts`.

## Requirements

- Docker Desktop
- Node.js 22 for running checks and builds outside Docker

## Local development

Start Docker Desktop, then run:

```sh
docker compose up
```

Or open `pinewood-derby.code-workspace` in VS Code and press **F5** with **Pinewood Derby (Docker Compose)** selected.

- Website: http://localhost:4280
- Organizer page: http://localhost:4280/admin
- Cosmos Data Explorer: http://localhost:1234

Use `localhost` so form submissions match the configured origin. No Azure credentials are needed. For organizer access, use the local authentication simulator with Microsoft/AAD, any user ID, and the `organizer` role.

Changes to `src/` and `public/` rebuild automatically. Stop with Ctrl+C and `docker compose down`; local data survives restarts.

## Checks and build

With Compose running:

```sh
docker compose exec web npm run check
docker compose exec web npm test
docker compose exec web npm run test:integration
```

Integration tests use a separate, temporary Cosmos database.

For a native build:

```sh
npm ci
npm run check
npm test
npm run build
```

Browser regression checks (run natively; no Cosmos database needed):

```sh
npx playwright install chromium
npm run test:browser
```

Build output: `dist/site` for static pages and `dist/api` for the managed Azure Functions API.

## Repository structure

- `src/views.tsx`: pages, forms, and HTML fragments
- `src/app.tsx`: API routes, validation responses, and authorization
- `src/domain.ts`: registration rules and CSV export
- `src/store.ts`: Cosmos persistence
- `src/event.ts`: event details, contacts, and deadlines
- `public/`: styles, browser behavior, icons, and images
- `tests/`: unit and Cosmos integration tests

## Deployment

[GitHub Actions](.github/workflows) checks, builds, and deploys pushes to `main` to [ankenygsderby.com](https://ankenygsderby.com). Pull requests run checks without deploying.

Hosting uses Azure Static Web Apps with a managed API and Cosmos DB. Infrastructure is managed separately. Deployment requires the `AZURE_STATIC_WEB_APPS_API_TOKEN` repository secret; server settings are `COSMOS_ENDPOINT`, `COSMOS_KEY`, `COSMOS_DATABASE`, and `SITE_ORIGIN`. Invite organizers through the Static Web App's Role Management with the `organizer` role.

The Girl Scout Trefoil asset comes from [Girl Scouts of Southern Illinois branding resources](https://www.gsofsi.org/en/members/for-volunteers/volunteer-essentials/gsofsi-branding.html).
