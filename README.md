# Adewale STEM Contest

Production-ready realtime STEM competition platform designed for deployment on Vercel.

## Architecture

- Next.js frontend in `apps/web`
- NestJS API in `apps/api`
- Vercel Services for one-project deployment
- PostgreSQL for durable application state
- Redis for realtime coordination
- Socket.IO for live contest events

## Deployment

This repository is configured for Vercel Services. The frontend is public at `/`; the API is public at `/api/*`.

See `docs/DEPLOYMENT.md` for environment variables and deployment steps.
