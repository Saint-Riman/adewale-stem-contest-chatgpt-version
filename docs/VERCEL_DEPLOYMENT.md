# Vercel deployment

## Vercel project

Import the repository at the repository root. Do not set `apps/web` or `apps/api` as the Vercel project root. The root `vercel.json` defines both services.

The project contains:

- `web`: Next.js, public at `/`
- `api`: NestJS, public at `/api/*`

Vercel Services builds both together.

## Required environment variable

Set this for the API service:

`DATABASE_URL`

Use a hosted PostgreSQL database. Do not point production at the PostgreSQL container in `docker-compose.yml`.

## Recommended for realtime scaling

Set:

`REDIS_URL`

Redis is used as the Socket.IO pub/sub adapter when present. Without it, the application can still run, but realtime broadcasts are local to an individual backend instance and should not be treated as a horizontally scaled competition deployment.

## API checks

After deployment:

- `/api/health` should return JSON containing `ok: true`.
- Socket.IO connects through `/api/socket.io`.
- Contestants join with a room code, not an internal session ID.

## Important

Do not add `NEXT_PUBLIC_WS_URL=http://localhost:4000` to Vercel. The browser uses the same deployed origin and the `/api/socket.io` path.

Vercel Services keeps the public routing in the root `vercel.json`; NestJS itself is mounted under the `api` prefix so the routed paths match.
