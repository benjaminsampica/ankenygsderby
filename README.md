# Pinewood Derby 2027

HTML + HTMX 2, server-rendered Hono TSX, TypeScript Azure Functions, and Cosmos DB. No React runtime and no .NET dependency.

## Run locally

Install/start Docker Desktop. Open `pinewood-derby.code-workspace` in VS Code, choose **Pinewood Derby (Docker Compose)** under Run and Debug, and press **F5**. Or run:

```sh
docker compose up
```

First startup downloads images and installs JavaScript dependencies. When ready:

- Website: http://localhost:4280
- Organizer page: http://localhost:4280/admin
- Local Cosmos Data Explorer: http://localhost:1234

Use **localhost**, not `127.0.0.1`, for the website so its configured origin matches form submissions. Everything stays on your machine. No Azure account or credentials needed.

The organizer link opens the Static Web Apps authentication simulator. Enter any local user ID/name and add the **organizer** role. Select Microsoft/AAD if prompted. An authenticated user without that role cannot access the roster. This simulated login exists only in the local SWA CLI; production uses Microsoft's real sign-in and invitations.

Compose starts a persistent Cosmos emulator and a Node 22 development container. Inside the development container, the same Hono routes used by the managed Functions adapter run through a Node HTTP host. The SWA CLI serves static pages, proxies `/api`, and emulates authentication/routing. This is not the full Azure Functions host; the production adapter is compiled separately and must be smoke-tested on Azure before launch.

Edit `src/` or `public/` and refresh the browser. The API restarts and static pages rebuild automatically. Dependencies and build outputs live in Docker volumes, so host and Linux binaries never mix.

Stop with Ctrl+C, then `docker compose down` if needed. Database contents survive normal stops. The disposable local test key in `dev/cosmos.key` is intentionally committed and must never be used in Azure.

## Checks

With Compose running:

```sh
docker compose exec web npm run check
docker compose exec web npm test
docker compose exec web npm run test:integration
```

Integration tests create and delete a separate test database. They exercise real Cosmos transactions, simultaneous signups, retry idempotency, stale edits, private links, cutoff handling, and expiry. They do not modify the development roster.

For native editing/building, use Node 22 and `npm ci`, then `npm run check` and `npm run build`.

## Main code

- `src/views.tsx`: typed HTML components shared by static pages and server fragments.
- `src/app.tsx`: HTTP routes, form validation responses, CSRF checks, and organizer authorization.
- `src/store.ts`: Cosmos persistence, transactional number allocation, and optimistic concurrency.
- `src/event.ts`: public event copy, contacts, level names, and fixed registration and retention dates.
- `public/`: shared styles and small HTMX/clipboard/print behavior.

Public form collects first name, last initial, level, and troop number. The initial accepts one ASCII letter A–Z; lowercase input is normalized to uppercase in the browser and API. Each new registration uses a random UUID v4 as both its Cosmos record ID and private confirmation token. The UUID lives in the URL fragment, keeping it out of ordinary server URL logs. The receipt endpoint receives it in the `X-Receipt-Token` request header; never enable request-header logging containing this value. Anyone holding a saved link can read that one registration, but cannot edit it or access the roster. No receipt secret is required. Older local records retain their prefixed IDs; organizers can open their confirmations to obtain replacement links. Old signed confirmation links no longer work.

Race numbers use separate ranges: Daisy 100–199, Brownie 200–299, Junior 300–399, Cadette 400–499, Senior 500–599, and Ambassador 600–699. Each range starts at its first number. Numbers are never reused, including after a level change. A full range blocks additional allocations rather than spilling into another level. Changing a racer’s level assigns a new number from the destination range; the same confirmation link shows the updated number. A retry returns the saved registration. Existing registrations created before this change retain their assigned numbers; startup upgrades the counters without renumbering them. Matching names are flagged for organizer review, not silently merged. Organizers can edit records and add entries after public closure.

Public registration closes January 4, 2027 at 00:00 Central. This deadline and the retention date are fixed in `src/event.ts`; no organizer settings are needed. Participant data becomes inaccessible February 8, 2027 at 00:00 Central. Cosmos TTL performs background deletion; every edit preserves the same expiration date. Provider backups and downloaded exports have separate retention.

## DerbyNet export

Export CSV from the organizer page. In DerbyNet, open **Set-Up → Import Roster**, choose the file, enable the header row, then map:

| CSV column | DerbyNet field |
| --- | --- |
| First Name | First name |
| Last Name | Last name (initial) |
| Segment | Segment / racing group (troop level) |
| Car Number | Car number |
| Troop Number | Keep for organizer reference; leave unmapped if unsupported |

Review assigned car numbers after import. DerbyNet imports append entries: avoid importing the same full roster twice. Validate against the event laptop's installed DerbyNet version before race day.

## Azure deployment

- Subscription: `Mine` (`5ec3a12c-48ea-4088-81db-1e361eeaf4fe`), personal tenant.
- Resource group: `ankenygsderby`, Central US.
- Static Web App: `ankenygsderby`, Free plan.
- Website: https://jolly-stone-063af2610.5.azurestaticapps.net
- Cosmos account: `ankenygsderby-cosmos`; database: `pinewood`; container: `event-data`.
- GitHub: https://github.com/benjaminsampica/ankenygsderby (private).

The `Build and deploy` GitHub Actions workflow checks TypeScript, runs unit tests, builds the site and API, and installs API dependencies. Pushes to `main` deploy production and check `/api/health`; pull requests run the build and checks only. The workflow can also be run manually on `main`. Infrastructure is managed separately in Azure and is never provisioned by this workflow. Cosmos integration tests run locally against the emulator using the commands above.

The repository secret `AZURE_STATIC_WEB_APPS_API_TOKEN` authorizes deployment to this Static Web App. Database credentials live only in Azure application settings. To replace a deployment token, get it from the Static Web App's **Manage deployment token** page and update the matching GitHub Actions secret.

`npm run build` produces `dist/site` and `dist/api`. Deploy these as the static assets and **managed API** of an Azure Static Web Apps **Free** app; use `node:22` and preserve the `/api` prefix. Install the generated API package's dependencies during deployment. Do not create a separate paid Function App.

Create one single-region Cosmos NoSQL account with free tier enabled and one `event-data` container, partition key `/eventId`, fixed 400 RU/s, `defaultTtl: -1`. Application startup seeds only the nonpersonal event-settings record. Provision production database/container before startup. Existing free-tier resources can be reused if their combined capacity fits the allowance.

Configure server-side SWA application settings:

- `COSMOS_ENDPOINT`: HTTPS Cosmos account endpoint.
- `COSMOS_KEY`: account credential (never in browser assets).
- `COSMOS_DATABASE`: production database name.
- `SITE_ORIGIN`: exact canonical HTTPS site origin, without trailing slash. Redirect alternate hostnames to this origin before accepting forms.

Do **not** set `NODE_ENV=development` or any local emulator settings in production. Invite the two Microsoft accounts with the `organizer` role through the SWA portal. Route rules protect both `/admin*` and `/api/admin/*`, and the API checks the organizer role again. Only trust `x-ms-client-principal` when the API is behind the SWA gateway; the local API binds to loopback inside its container.

Resources were provisioned separately in the personal subscription. Cosmos uses the account's free-tier allowance; storage above the allowance, optional diagnostics, or paid service tiers can cost money.

### Organizer invitations

Open the Static Web App in Azure Portal, then **Role Management → Invite**. Choose Microsoft Entra ID, enter the organizer's Microsoft account email, choose the website domain, and assign `organizer` (lowercase). Generate the invitation and share its link with the organizer. They must accept with the matching account before opening `/admin`. No custom Entra app registration is needed.

### Custom domain

DNS and domain binding are managed manually. After binding the Porkbun domain in Azure, change `SITE_ORIGIN` to its exact HTTPS origin without a trailing slash and make it the default domain so alternate hostnames redirect there. Until then, use the Azure hostname above for registration and invitations. No source deployment is required for the application setting change.

## Before opening registration

- Confirm whether the service unit requires emergency contact, consent, or other fields.
- Supply race times and approved car requirements. The guide currently states that details are coming soon.
- Verify Microsoft invitations, concurrent signup behavior, and DerbyNet import against the deployed app.
- Payment, family emails, race timing/results, and the separate cybersecurity initiative are outside this site.

## Reset local data

`docker compose down` keeps registrations. To deliberately erase **all local development data and dependency volumes**, use `docker compose down --volumes`. This never affects Azure, but cannot be undone locally.

## Event images

The supplied archives are kept outside public assets in the ignored `.local/assets/` directory. Only selected web-sized copies ship with the site:

- `public/images/race-day-2026*.jpg`: `20260110_171232529_iOS.heic`, home page.
- `public/images/pit-area-2026*.jpg`: `20260110_153527867_iOS.heic`, home gallery.
- `public/images/spectators-2026*.jpg`: `20260110_163551306_iOS.heic`, home gallery.
- `public/images/cars-2026*.jpg`: `20260110_170422080_iOS.heic`, car guide.
- `public/images/derby-logo.png`: the supplied 2026 logo, used in the header. Replace this file with the 2027 artwork when ready.

Photos have responsive 700px/1400px versions, descriptive alternative text, and stripped camera metadata. Originals remain unchanged. The “Previous years” gallery contains nine photos from 2026; the upcoming event is January 9, 2027.

Gallery thumbnails open a native modal photo viewer with previous/next controls, arrow-key navigation, Escape to close, and focus restored to the selected thumbnail. Larger photos load when opened. Additional gallery images come from `20260110_023051940_iOS` (track), `20260110_023047532_iOS` (ribbons), `20260110_160743130_iOS` (starting grid), `20260110_163148721_iOS` (trackside), `20260110_180638940_iOS` (photo booth), and `20260110_155750166_iOS` (check-in). Converted copies have orientation applied and omit camera metadata.
