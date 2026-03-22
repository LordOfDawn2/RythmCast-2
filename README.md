# RythmCast - Spotify Microservices App

## Description
RythmCast lets users authenticate with Spotify, analyze listening habits, and generate/save personalized playlists.
The project demonstrates a containerized microservices architecture with strict network isolation.

## Technology Stack
- Frontend: Node.js + Express static server
- API 1: Node.js + Express + PostgreSQL (users/auth)
- API 2: Node.js + Express + PostgreSQL (Spotify tokens and recommendations)
- Reverse Proxy + Load Balancer: Nginx (gateway + round-robin on API2 replicas)
- Queue: Redis (job queue endpoints in API2)
- GraphQL: API1 `/graphql`
- API Documentation: Swagger UI on API1 `/docs`
- Orchestration: Docker Compose
- CI/CD + Security: Gitea Actions + Trivy + Docker Buildx

## Architecture
```mermaid
flowchart LR
  U[User] --> G[Nginx Gateway]
  G --> F[Frontend]
  G --> A1[API 1 Users]
  G --> A2[API 2 Spotify]
  G --> A2R[API 2 Spotify Replica]
  A1 --> D1[(PostgreSQL db1)]
  A2 --> D2[(PostgreSQL db2)]
  A2R --> D2
  A2 --> R[(Redis Queue)]
  A2R --> R
```

Network isolation rules implemented:
- Frontend can access API 1 and API 2.
- API 1 can access only `db1`.
- API 2 can access only `db2`.
- Databases are isolated from host and from each other.

## Installation
1. Clone repository
```bash
git clone <your-repo-url>
cd RythmCast
```
2. Copy env template if needed
```bash
cp .env.example .env
```
3. Start all services
```bash
docker compose up --build
```
4. Open app
- Frontend: http://localhost:3000
- API 1 docs (Swagger): http://localhost:3000/docs
- API 1 GraphQL: http://localhost:3000/graphql
- API 2 queue status: http://localhost:3000/api/spotify/queue/status

## Bonus Features Implemented
- Reverse proxy with Nginx gateway (`proxy/nginx.conf`)
- Load balancing with API2 round-robin (`api2` + `api2-replica` upstream)
- Queue system with Redis and API2 queue endpoints:
  - `POST /api/spotify/queue/enqueue`
  - `POST /api/spotify/queue/dequeue`
  - `GET /api/spotify/queue/status`
- GraphQL endpoint on API1: `GET/POST /graphql`
- Multi-stage Docker builds for frontend, api1, and api2
- OpenAPI/Swagger docs for API1: `GET /docs`

## Environment
| Variable | Description | Example |
|---|---|---|
| `FRONTEND_PORT` | Frontend service port | `3000` |
| `API1_PORT` | API 1 service port | `5001` |
| `API1_DATABASE_URL` | PostgreSQL URL for API 1 | `postgresql://api1_user:api1_password@db1:5432/rythmcast_users` |
| `API2_PORT` | API 2 service port | `5002` |
| `API2_DATABASE_URL` | PostgreSQL URL for API 2 | `postgresql://api2_user:api2_password@db2:5432/rythmcast_spotify` |
| `DOCKERHUB_USERNAME` | Docker Hub namespace for CI push | `your-name` |

## Demo
- Click **Se connecter avec Spotify** on the frontend.
- Browse profile, top tracks, top artists, and recently played songs.
- Generate simple and smart playlists, then save to Spotify.
- Use API health endpoints to verify service status.

## Data Persistence Proof
Two named volumes are configured:
- `api1-db-data`
- `api2-db-data`

Data remains after `docker compose down` and starting again with `docker compose up`.

## CI/CD
Pipeline file: `.gitea/workflows/ci.yaml`
- Trivy security scan fails for `MEDIUM`, `HIGH`, `CRITICAL`.
- Builds all service images.
- Pushes images to Docker Hub on push events.

## Team
See [AUTHORS.md](AUTHORS.md).

## Presentation Assets
- Script: [PRESENTATION_SCRIPT.md](PRESENTATION_SCRIPT.md)
- Live demo checklist: [DEMO_FLOW.md](DEMO_FLOW.md)
- Slide structure: [SLIDES_OUTLINE.md](SLIDES_OUTLINE.md)
