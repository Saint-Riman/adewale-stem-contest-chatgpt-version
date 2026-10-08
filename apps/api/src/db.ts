import { Pool } from "pg";

let pool: Pool | undefined;

export function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured.");
  pool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DB_POOL_MAX ?? 5),
    ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false }
  });
  return pool;
}

let schemaReady: Promise<void> | undefined;

export function ensureSchema() {
  schemaReady ??= (async () => {
    await db().query(`
      CREATE TABLE IF NOT EXISTS live_sessions (
        id TEXT PRIMARY KEY,
        room_code TEXT UNIQUE NOT NULL,
        quiz JSONB NOT NULL,
        state TEXT NOT NULL,
        current_index INTEGER NOT NULL DEFAULT -1,
        question_started_at BIGINT,
        question_deadline BIGINT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS session_participants (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
        display_name TEXT NOT NULL,
        contestant_id TEXT,
        score INTEGER NOT NULL DEFAULT 0,
        correct INTEGER NOT NULL DEFAULT 0,
        incorrect INTEGER NOT NULL DEFAULT 0,
        total_response_time_ms BIGINT NOT NULL DEFAULT 0,
        connected BOOLEAN NOT NULL DEFAULT FALSE
      );
      CREATE TABLE IF NOT EXISTS answers (
        session_id TEXT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
        participant_id TEXT NOT NULL,
        question_index INTEGER NOT NULL,
        choice TEXT NOT NULL,
        response_time_ms BIGINT NOT NULL,
        points INTEGER NOT NULL,
        correct BOOLEAN NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY(session_id, participant_id, question_index)
      );
    `);
  })();
  return schemaReady;
}