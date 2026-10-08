import { Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { db, ensureSchema } from "./db";
import { AnswerChoice, LiveSession, Participant, Quiz } from "./session.types";
import { scoreAnswer } from "./scoring";

@Injectable()
export class SessionService {
  async create(quiz: Quiz) {
    await ensureSchema();
    const id = randomBytes(12).toString("hex");
    const roomCode = randomBytes(8).toString("base64url").slice(0, 5).toUpperCase();
    await db().query(
      "INSERT INTO live_sessions(id,room_code,quiz,state) VALUES($1,$2,$3,'LOBBY')",
      [id, roomCode, JSON.stringify(quiz)]
    );
    return this.snapshot(id);
  }

  async resolveId(idOrCode: string) {
    await ensureSchema();
    const r = await db().query(
      "SELECT id FROM live_sessions WHERE id=$1 OR room_code=$2 LIMIT 1",
      [idOrCode, idOrCode.toUpperCase()]
    );
    if (!r.rows[0]) throw new NotFoundException("Session or room not found");
    return r.rows[0].id as string;
  }

  async getSession(idOrCode: string): Promise<LiveSession> {
    await ensureSchema();
    const id = await this.resolveId(idOrCode);
    const r = await db().query("SELECT * FROM live_sessions WHERE id=$1", [id]);
    if (!r.rows[0]) throw new NotFoundException("Session not found");
    const row = r.rows[0];
    const quiz = row.quiz as Quiz;
    const participantRows = await db().query(
      "SELECT * FROM session_participants WHERE session_id=$1",
      [id]
    );
    const participants = new Map<string, Participant>();
    for (const p of participantRows.rows) {
      participants.set(p.id, {
        id: p.id,
        displayName: p.display_name,
        contestantId: p.contestant_id ?? undefined,
        score: p.score,
        correct: p.correct,
        incorrect: p.incorrect,
        unanswered: 0,
        totalResponseTimeMs: Number(p.total_response_time_ms),
        connected: p.connected
      });
    }
    return {
      id,
      roomCode: row.room_code,
      quiz,
      state: row.state,
      currentIndex: row.current_index,
      participants,
      answers: new Map(),
      questionStartedAt: row.question_started_at ? Number(row.question_started_at) : undefined,
      questionDeadline: row.question_deadline ? Number(row.question_deadline) : undefined
    };
  }

  async snapshot(idOrCode: string) {
    const s = await this.getSession(idOrCode);
    const q = s.currentIndex >= 0 ? s.quiz.questions[s.currentIndex] : undefined;
    return {
      id: s.id,
      roomCode: s.roomCode,
      state: s.state,
      currentIndex: s.currentIndex,
      totalQuestions: s.quiz.questions.length,
      question: q
        ? { id: q.id, text: q.text, options: q.options, timeLimitSeconds: q.timeLimitSeconds, explanation: q.explanation }
        : undefined,
      questionStartedAt: s.questionStartedAt,
      questionDeadline: s.questionDeadline,
      participantCount: s.participants.size
    };
  }

  async join(roomCode: string, name: string, contestantId?: string) {
    const sessionId = await this.resolveId(roomCode);
    const found = await db().query(
      `SELECT * FROM session_participants
       WHERE session_id=$1 AND (($2::text IS NOT NULL AND contestant_id=$2) OR LOWER(display_name)=LOWER($3))
       LIMIT 1`,
      [sessionId, contestantId ?? null, name]
    );
    const existing = found.rows[0];
    const id = existing?.id ?? randomBytes(10).toString("hex");
    await db().query(
      `INSERT INTO session_participants
       (id,session_id,display_name,contestant_id,score,correct,incorrect,total_response_time_ms,connected)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,true)
       ON CONFLICT(id) DO UPDATE SET
       display_name=EXCLUDED.display_name, contestant_id=EXCLUDED.contestant_id, connected=true`,
      [id, sessionId, name, contestantId ?? existing?.contestant_id ?? null,
       existing?.score ?? 0, existing?.correct ?? 0, existing?.incorrect ?? 0,
       existing?.total_response_time_ms ?? 0]
    );
    return { id, displayName: name, contestantId };
  }

  async start(roomCode: string) {
    const s = await this.getSession(roomCode);
    if (s.state !== "LOBBY") throw new Error("Cannot start this session");
    return this.startQuestion(s.id, 0);
  }

  async next(roomCode: string) {
    const s = await this.getSession(roomCode);
    const nextIndex = s.currentIndex + 1;
    if (nextIndex >= s.quiz.questions.length) {
      await db().query("UPDATE live_sessions SET state='FINAL_RESULTS' WHERE id=$1", [s.id]);
      return this.snapshot(s.id);
    }
    return this.startQuestion(s.id, nextIndex);
  }

  private async startQuestion(sessionId: string, index: number) {
    const s = await this.getSession(sessionId);
    const q = s.quiz.questions[index];
    if (!q) throw new Error("Question missing");
    const started = Date.now();
    const deadline = started + q.timeLimitSeconds * 1000;
    await db().query(
      `UPDATE live_sessions SET state='QUESTION',current_index=$2,
       question_started_at=$3,question_deadline=$4 WHERE id=$1`,
      [sessionId, index, started, deadline]
    );
    return this.snapshot(sessionId);
  }

  async answer(roomCode: string, participantId: string, choice: AnswerChoice) {
    const s = await this.getSession(roomCode);
    if (s.state !== "QUESTION") throw new Error("Answers are not being accepted");
    const now = Date.now();
    if (!s.questionDeadline || now > s.questionDeadline) throw new Error("Deadline passed");
    const q = s.quiz.questions[s.currentIndex];
    const participant = s.participants.get(participantId);
    if (!q || !participant) throw new Error("Participant not found");

    const responseTimeMs = now - (s.questionStartedAt ?? now);
    const correct = choice === q.correctAnswer;
    const points = scoreAnswer({
      correct,
      responseTimeMs,
      totalTimeMs: q.timeLimitSeconds * 1000
    });

    try {
      await db().query(
        `INSERT INTO answers(session_id,participant_id,question_index,choice,response_time_ms,points,correct)
         VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [s.id, participantId, s.currentIndex, choice, responseTimeMs, points, correct]
      );
    } catch (error: any) {
      if (error?.code === "23505") throw new Error("Answer already submitted");
      throw error;
    }

    await db().query(
      `UPDATE session_participants
       SET score=score+$3,correct=correct+$4,incorrect=incorrect+$5,
           total_response_time_ms=total_response_time_ms+$6
       WHERE id=$1 AND session_id=$2`,
      [participantId, s.id, points, correct ? 1 : 0, correct ? 0 : 1, responseTimeMs]
    );

    return { accepted: true, points, responseTimeMs };
  }

  async reveal(roomCode: string) {
    const id = await this.resolveId(roomCode);
    await db().query("UPDATE live_sessions SET state='REVEAL' WHERE id=$1", [id]);
    return this.snapshot(id);
  }

  async leaderboard(roomCode: string) {
    const id = await this.resolveId(roomCode);
    await db().query("UPDATE live_sessions SET state='LEADERBOARD' WHERE id=$1", [id]);
    return this.snapshot(id);
  }

  async end(roomCode: string) {
    const id = await this.resolveId(roomCode);
    await db().query("UPDATE live_sessions SET state='ENDED' WHERE id=$1", [id]);
    return this.snapshot(id);
  }
}