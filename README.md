# Adewale STEM Contest

A production-oriented realtime STEM competition platform for school and academic competitions.

## Product direction

The platform is designed around a projector-first host experience, mobile-first contestant experience, server-authoritative timing and scoring, and an admin workflow for importing and managing question banks.

## Planned stack

- Next.js + React + TypeScript
- Tailwind CSS
- NestJS + TypeScript
- PostgreSQL
- Redis
- Socket.IO
- Drizzle ORM
- Zod
- SheetJS
- Vitest + Playwright

## Core flow

ADMIN → question bank → quiz builder → live session → contestants join by room code → server-authoritative questions/timer → answers → scoring → reveal → leaderboard → final results.

## Development status

The repository is being built incrementally, starting with the architecture and core live-quiz vertical slice before secondary administration and analytics features.

## Requirements

Node.js 22+, pnpm 10+, PostgreSQL 16+, Redis 7+.
