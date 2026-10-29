# Running the MealMaker API

How the API is served, how keys are managed, and how data, thumbnails and code reach
production. The API itself is described in [api.md](api.md).

## Where things run

| | Home dev server (Kieran's PC) | Production (VPS) |
| --- | --- | --- |
| API | `http://192.168.4.48:3020/api/v1` | `https://mealmaker.brotherk3d.com/api/v1` |
| Food data | local `nutrition_lab`, the one the lab tools refine | a copy, replaced by `npm run deploy:data` |
| API keys | `api` schema inside local `nutrition_lab` | `mealmaker_api` database (never touched by data deploys) |
| Thumbnails | `db/lab/thumbnails`, written by the studio | `/opt/mealmaker/thumbnails`, synced by `npm run deploy:thumbs` |

The app's own routes (`/api/generate-meal`, `/api/parse-recipe`, ...) are unchanged and
keyless: the web app uses them. `/api/v1` is the keyed API for everything else.

## The home dev server

```bash
npm run api:dev     # API on every network interface, restarts on every save
```

Use this while developing the API together: either of you saves a file under
`server/` or `shared/` and the server restarts in about a second. Other options:

- `npm run server:lan` builds once and serves without watching.
- `npm run server` serves on `localhost` only, as before.

The Vite client (`npm run dev`, port 3010) is separate and hot-reloads by itself.

Windows Firewall already allows Node on the private network. If the PC's address
changes from `192.168.4.48`, update the base URL in api.md.

## API keys

```bash
npm run api-keys -- create "Wendy dev" --scopes foods,parse,voice,generate --rate 120 --env dev
npm run api-keys -- list
npm run api-keys -- revoke <id>
npm run api-keys -- usage 7          # requests, errors and timings per key and route
```

- A key is printed once, at creation; only its hash is stored. Lost keys are revoked
  and replaced.
- A revoked key stops working within 30 s.
- Keys belong to the server they were made on.

**Production keys:** the CLI needs the repo's TypeScript, which the VPS doesn't have.
Run it from your PC through an SSH tunnel to the VPS database instead:

```bash
ssh -N -L 15432:127.0.0.1:<port> wendy@elvis-green.bnr.la &      # <port> from vps-setup's output
API_DATABASE_URL='postgresql://mealmaker_app:<app password>@127.0.0.1:15432/mealmaker_api' \
  npm run api-keys -- create "Wendy app" --scopes foods,parse,voice --rate 60
```

The app password is in `/etc/mealmaker/api-db.env` on the VPS (`sudo cat` it).

## First-time production setup

Once:

1. **Set up Postgres on the VPS** (installs PostgreSQL 18, creates the roles, the keys
   database and the thumbnail folder):
   ```bash
   ssh -t wendy@elvis-green.bnr.la 'sudo bash -s' < script/vps-setup.sh
   ```
2. **Add the printed lines to the API server's environment** (the env file
   `mealmaker-ctl` starts it with): `NUTRITION_DATABASE_URL`, `API_DATABASE_URL`,
   `THUMBNAIL_DIR`, `LOOKUP_OLLAMA_URL`. Check that `OLLAMA_API_KEY`, `OLLAMA_MODEL`
   and `OPENAI_API_KEY` are there too.
3. **Deploy:** `npm run deploy:data`, `npm run deploy:thumbs`, then
   `bash script/deploy-vps.sh` for the code.
4. **Check:** `curl https://mealmaker.brotherk3d.com/api/v1/health` should return
   `{"ok":true,"database":true}`.

If nginx limits request bodies to its default 1 MB, long voice clips will fail with
`413`. Add `client_max_body_size 12m;` to the `/api` location.

## Deploying

| What changed | Command | Notes |
| --- | --- | --- |
| Food data (refinement, synonyms, resolver functions) | `npm run deploy:data` | Dump (about 6 MB) → restore beside the live copy → check → swap. |
| New or regenerated thumbnails | `npm run deploy:thumbs` | Sends only new or changed images. `-- --prune` also deletes ones gone locally. |
| API or app code | `bash script/deploy-vps.sh` | Builds the site and server bundle, uploads and restarts. |

**Data deploys check before they go live.** The new copy must have the same number of
foods as yours, and the search resolver must answer. Otherwise the live data is left
alone and the restore log is on the VPS at `/tmp/nutrition_lab.restore.log`.

The previous data is kept, so a bad deploy can be undone:

```bash
npm run deploy:data -- --rollback
```

**Coordinating with code:** a code change that needs new database objects (a new
function or column) must have its data deployed first, then the code. A data change the
running code doesn't depend on can go any time.
