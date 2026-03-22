# RythmCast Live Demo Flow (6-7 min)

## Preparation (before presenting)
1. Open terminal in project root.
2. Run:
```bash
docker compose up --build -d
```
3. Keep browser ready at `http://localhost:3000`.

## Step 1 - Show architecture is up (1 min)
Command:
```bash
docker compose ps
```
Expected:
- `frontend`, `api1`, `api2`, `db1`, `db2` all `Up (healthy)`.

## Step 2 - Show frontend and APIs health (45 sec)
Commands:
```bash
curl http://localhost:3000/health
curl http://localhost:5001/health
curl http://localhost:5002/health
```
Expected:
- JSON with `{ status: "ok" }` for each service.

## Step 3 - Functional app flow (1.5 min)
In browser (`http://localhost:3000`):
1. Click **Load Songs** (data from API 2).
2. Fill username/mood/song and click **Save** (writes to API 1 + db1).
3. Click **Load Preferences** to display saved preferences.

## Step 4 - Prove network isolation (1.5 min)
Commands:
```bash
docker compose exec api1 sh -lc "wget -qO- http://db1:27017 || true"
docker compose exec api1 sh -lc "wget -qO- http://db2:27017 || true"
docker compose exec api2 sh -lc "wget -qO- http://db2:27017 || true"
docker compose exec api2 sh -lc "wget -qO- http://db1:27017 || true"
```
Explain while running:
- API 1 can only resolve/reach resources in its own DB network.
- API 2 can only resolve/reach resources in its own DB network.
- Cross-database access is blocked by network design.

## Step 5 - Prove persistence (1.5 min)
1. Save a preference from UI.
2. Restart stack:
```bash
docker compose down
docker compose up -d
```
3. Reload preferences in UI.
Expected:
- Previously saved record is still present (named volumes).

## Step 6 - Prove hot reload (1 min)
1. Edit a visible text in `frontend/src/index.html`.
2. Refresh browser.
Expected:
- Change appears instantly.
- No `docker compose restart` needed.

## Step 7 - Show CI/CD briefly (30 sec)
Open `.gitea/workflows/ci.yaml` and highlight:
- Trivy severity gate: MEDIUM/HIGH/CRITICAL
- Build matrix: frontend/api1/api2
- Docker Hub push on `push` event

## Backup commands (if needed)
```bash
docker compose logs --tail=50 api1
docker compose logs --tail=50 api2
docker compose logs --tail=50 frontend
```
