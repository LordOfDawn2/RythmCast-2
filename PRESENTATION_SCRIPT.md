# RythmCast Presentation Script (9-10 min)

## 0:00 - 0:45 | Opening (Speaker 1)
Hello everyone. We are Team RythmCast.
Our project solves a simple real problem: users want fast music discovery with mood-based preferences, and teams need a clean architecture to build this safely.
So we built a microservices web app containerized with Docker, with strict network isolation, persistent data, and CI/CD security scanning.

## 0:45 - 2:15 | Problem + Architecture (Speaker 1)
The app has 3 application services and 2 databases:
- Frontend service for user interactions
- API 1 for preferences management
- API 2 for song catalog
- MongoDB db1 only for API 1
- MongoDB db2 only for API 2

Why this architecture:
- Separation of responsibilities
- Independent scaling and deployment
- Better fault isolation
- Better security boundaries

Network isolation rules implemented:
- Frontend can reach API 1 and API 2
- API 1 can only reach db1
- API 2 can only reach db2
- Databases cannot talk to each other and are not exposed to host ports

## 2:15 - 3:45 | Dockerfiles and Image Strategy (Speaker 2)
For each service we created a dedicated Dockerfile with:
- Pinned base image: node:20.11.1-alpine3.19
- Non-root execution with USER node
- HEALTHCHECK endpoint verification
- Lean dependency installation

This gives us reproducibility, reduced attack surface, and production-ready container behavior.

## 3:45 - 5:00 | Persistence + Hot Reload (Speaker 2)
Persistence:
- One named volume per database
- api1-db-data for db1
- api2-db-data for db2
- Data survives compose down/up cycles

Hot reload requirement:
- Frontend source is bind-mounted from host to container
- Code changes in frontend/src appear immediately after browser refresh
- No container restart needed

## 5:00 - 6:30 | CI/CD + Security (Speaker 3)
Our Gitea Actions pipeline has two major stages:
1. Security scan with Trivy
   - Fails on MEDIUM, HIGH, and CRITICAL findings
2. Build and push
   - Builds frontend, api1, api2 images
   - Pushes to Docker Hub on push events
   - Also scans built images with Trivy

This enforces security as part of delivery, not as a manual afterthought.

## 6:30 - 8:45 | Live Demo (Speaker 3 + Speaker 4)
In the demo we prove:
- All services are healthy
- API 2 serves songs
- API 1 stores and retrieves preferences
- Network isolation is enforced
- Persistence works after restart
- Frontend hot reload works

(Use the DEMO_FLOW.md checklist exactly.)

## 8:45 - 9:30 | Teamwork + Challenges (Speaker 4)
How we collaborated:
- Feature branches + merge requests
- Shared coding conventions and documented env variables
- Clear ownership by service

Challenges we faced:
- Initial migration from monolith to microservices
- Docker daemon startup and dependency orchestration
- Verifying isolation and health checks reliably

How we solved them:
- Split services by domain responsibility
- Added healthchecks + depends_on conditions
- Validated with docker compose and endpoint checks

## 9:30 - 10:00 | Closing (Speaker 4)
RythmCast demonstrates a complete microservices delivery pipeline with practical security, resilience, and teamwork practices.
Thank you, and we are ready for questions.

---

## Q&A Quick Answers (5 min support)
- Why two databases?
  To enforce service ownership and isolation boundaries.
- Why Alpine images?
  Smaller footprint and faster pull/build.
- How do you prove isolation?
  Compose networks: each API shares a private network only with its own DB.
- How do you prove persistence?
  Save data, stop stack, restart stack, read same data.
- What is production-ready here?
  Non-root containers, health checks, pinned images, CI security gates.
