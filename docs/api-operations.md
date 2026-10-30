# Running the MealMaker API

How the API is served, how keys are managed, and how data, thumbnails, docs and code
reach production. The API itself is described in [api.md](api.md); the guide for
coding agents is [api-for-agents.md](api-for-agents.md).

## Where things run

| | Home dev server (Kieran's PC) | Production (VPS, elvis-green.bnr.la) |
| --- | --- | --- |
| API | `http://192.168.4.48:3020/api/v1` | `https://mealmaker.brotherk3d.com/api/v1` |
| Food data | local `nutrition_lab`, the one the lab tools refine | `public` schema of the `mealmaker` database, replaced by `npm run deploy:data` |
| API keys | `api` schema inside local `nutrition_lab` | `api` schema of `mealmaker` (data deploys never touch it) |
| Thumbnails | `db/lab/thumbnails`, written by the studio | `/opt/mealmaker/thumbnails`, synced by `npm run deploy:thumbs` |
| Agent guide (`/api/v1/docs`) | `docs/api-for-agents.md`, read live | copy in the bundle, updated by `script/deploy-vps.sh` |
| Service | `npm run api:dev` (watch mode) | systemd `mealmaker`, port 3200 behind nginx; env in `/opt/mealmaker/.env` |

The web app's own routes (`/api/generate-meal`, `/api/parse-recipe`, ...) are keyless and
run the same code. `/api/v1` is the keyed API for everything else.

## The home dev server

```bash
npm run api:dev     # API on every network interface, restarts on every save
```

Either of you saves a file under `server/` or `shared/` and the server restarts in
about a second. `npm run server:lan` builds once and serves without watching;
`npm run server` serves on `localhost` only. The Vite client (`npm run dev`, port 3010)
is separate and hot-reloads by itself.

Windows Firewall already allows Node on the private network. If the PC's address
changes from `192.168.4.48`, update the base URL in api.md and api-for-agents.md.

Voice parsing falls back to nemotron through the local Ollama (`localhost:11434`). When
Ollama isn't running, that fallback is skipped and only the rules are used.

## API keys

```bash
npm run api-keys -- create "Wendy dev" --scopes foods,parse,voice,generate --rate 120 --env dev
npm run api-keys -- list
npm run api-keys -- revoke <id>
npm run api-keys -- usage 7          # requests, errors and timings per key and route
```

A key is printed once, at creation; only its hash is stored, so a lost key is revoked
and replaced. A revoked key stops working within 30 s. Keys belong to the server they
were made on.

**Production keys** are made from your PC through an SSH tunnel to the VPS database:

```bash
URL="$(ssh -i ~/.ssh/bk3d_deploy root@elvis-green.bnr.la 'grep ^DATABASE_URL= /opt/mealmaker/.env | cut -d= -f2-')"
ssh -i ~/.ssh/bk3d_deploy -N -L 15432:127.0.0.1:5432 root@elvis-green.bnr.la &
API_DATABASE_URL="$(echo "$URL" | sed -E 's#@[^/]+/#@127.0.0.1:15432/#')" \
  npm run api-keys -- create "Wendy app" --scopes foods,parse,voice --rate 60
kill %1
```

## Deploying

All deploy scripts connect as `root@elvis-green.bnr.la` with `~/.ssh/bk3d_deploy`
(override with `DEPLOY_USER`, `DEPLOY_HOST`, `SSH_KEY`).

| What changed | Command | Notes |
| --- | --- | --- |
| Food data, synonyms, search functions (`db/lab/*.sql`) | `npm run deploy:data` | Dump (about 6 MB) → restore into a fresh `public` inside one transaction → check → commit. |
| New or regenerated thumbnails | `npm run deploy:thumbs` | Sends only new or changed images. `-- --prune` also deletes ones gone locally. |
| API or app code, or the agent guide | `bash script/deploy-vps.sh` | Builds the site and server bundle (which copies `docs/api-for-agents.md`), uploads, restarts. |

**Data deploys check before they go live.** The swap renames the live `public` schema to
`nl_prev`, restores the dump into a new `public`, and commits only if the food count
matches yours and the search resolver answers. Otherwise the transaction rolls back and
the live data is untouched. The previous data stays as `nl_prev`:

```bash
npm run deploy:data -- --rollback
```

**Coordinating with code:** when code needs new database objects (a new function or
column), deploy the data first, then the code. A data change the running code doesn't
depend on can go any time.

**Keeping the agent guide in step:** edit `docs/api-for-agents.md`, commit and push it
(your wife's agent pulls it from GitHub), and run `script/deploy-vps.sh` so
`/api/v1/docs` serves the same text.

## Search functions

`resolve_food` and `resolve_food_conf` are defined in `db/lab/18_search_speed.sql`
(which supersedes the versions in `4_search.sql` and `16_resolve_conf.sql`). Search
takes about 70-80 ms per query locally. When changing them, compare against the
previous definitions on a large query set before deploying: same foods, scores, tiers
and order.

## First-time setup (already done)

`bash script/vps-setup.sh` created `/opt/mealmaker/thumbnails` and appended
`NUTRITION_DATABASE_URL`, `NUTRITION_LAB_DATABASE=mealmaker`, `THUMBNAIL_DIR` and
`LOOKUP_OLLAMA_URL=https://ollama.com` to `/opt/mealmaker/.env`, reusing the existing
`DATABASE_URL` login. It never prints or overwrites existing values and is safe to
re-run. `OPENAI_API_KEY` was added separately for voice transcription.

nginx allows request bodies up to 10 MB, enough for any voice clip in practice.
