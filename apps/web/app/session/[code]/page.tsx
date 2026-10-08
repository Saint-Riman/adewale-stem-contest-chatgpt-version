"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { useParams } from "next/navigation";

type Choice = "A" | "B" | "C" | "D";

type SessionState = {
  roomCode: string;
  state: string;
  currentIndex: number;
  totalQuestions: number;
  question?: {
    id: string;
    text: string;
    options: Record<Choice, string>;
    timeLimitSeconds: number;
    explanation?: string;
  };
  questionDeadline?: number;
  participantCount: number;
};

export default function Session() {
  const params = useParams<{ code: string }>();
  const socketRef = useRef<Socket | null>(null);
  const [state, setState] = useState<SessionState | null>(null);
  const [selected, setSelected] = useState<Choice>();
  const [participantId, setParticipantId] = useState<string>();
  const [accepted, setAccepted] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [connection, setConnection] = useState<"connecting" | "connected" | "offline">("connecting");
  const [error, setError] = useState<string | null>(null);

  const roomCode = String(params.code).toUpperCase();

  useEffect(() => {
    const name = sessionStorage.getItem("contestantName") ?? "Guest";
    const socket = io(window.location.origin, {
      path: "/api/socket.io",
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setConnection("connected");
      setError(null);
      socket.emit(
        "session:join",
        {
          roomCode,
          displayName: name,
          contestantId: sessionStorage.getItem("contestantId") ?? undefined
        },
        (participant: { id?: string }) => {
          if (participant?.id) {
            setParticipantId(participant.id);
            sessionStorage.setItem("contestantId", participant.id);
          }
        }
      );
    });

    socket.on("disconnect", () => setConnection("offline"));

    socket.on("connect_error", (err) => {
      console.error("Realtime connection failed", err);
      setConnection("offline");
      setError("Connection lost. Retrying...");
    });

    socket.on("session:state", (nextState: SessionState) => {
      setState(nextState);
      setSelected(undefined);
      setAccepted(false);
      setError(null);
    });

    socket.on("answer:accepted", () => setAccepted(true));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomCode]);

  useEffect(() => {
    if (!state?.questionDeadline || state.state !== "QUESTION") {
      setSecondsLeft(null);
      return;
    }

    const tick = () => {
      const remaining = Math.max(0, state.questionDeadline! - Date.now());
      setSecondsLeft(Math.ceil(remaining / 1000));
    };

    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [state?.questionDeadline, state?.state]);

  function submit(choice: Choice) {
    const socket = socketRef.current;
    if (accepted || !state?.question || !participantId || !socket?.connected || secondsLeft === 0) return;

    setSelected(choice);
    socket.emit(
      "answer:submit",
      {
        roomCode,
        participantId,
        choice
      },
      (result: { accepted?: boolean; points?: number; responseTimeMs?: number }) => {
        if (result?.accepted) setAccepted(true);
        else setError("Your answer was not accepted.");
      }
    );
  }

  if (!state?.question) {
    return (
      <main className="min-h-screen bg-[#0b1730] grid place-items-center p-6 text-white">
        <div className="text-center">
          <p className="text-sm font-black uppercase tracking-[.2em] text-amber-400">Room {roomCode}</p>
          <h1 className="mt-4 text-4xl font-black">Waiting for the host</h1>
          <p className="mt-3 text-slate-400">Stay on this screen. The next question will appear automatically.</p>
          <p className="mt-6 text-sm font-bold uppercase tracking-widest text-slate-500">
            {connection === "connected" ? "Connected" : connection === "connecting" ? "Connecting..." : "Reconnecting..."}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0b1730] p-4 text-white md:p-10">
      <section className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between text-sm font-bold uppercase tracking-wider text-slate-300">
          <span>Question {state.currentIndex + 1} / {state.totalQuestions}</span>
          <span>{secondsLeft ?? state.question.timeLimitSeconds}s</span>
        </div>

        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-amber-400 transition-[width] duration-200"
            style={{
              width: `${Math.max(0, Math.min(100, ((secondsLeft ?? state.question.timeLimitSeconds) / state.question.timeLimitSeconds) * 100))}%`
            }}
          />
        </div>

        <h1 className="mt-8 text-3xl font-black leading-tight md:text-5xl">{state.question.text}</h1>

        <div className="mt-10 grid gap-3">
          {(["A", "B", "C", "D"] as Choice[]).map((key) => (
            <button
              key={key}
              disabled={accepted || secondsLeft === 0 || connection !== "connected"}
              onClick={() => submit(key)}
              className={`rounded-2xl border p-5 text-left text-lg font-bold transition ${selected === key ? "border-amber-400 bg-amber-400/20" : "border-white/15 bg-white/5"} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <span className="mr-4 inline-grid h-9 w-9 place-items-center rounded-lg bg-white/10">{key}</span>
              {state.question.options[key]}
            </button>
          ))}
        </div>

        {accepted && <p className="mt-6 text-center font-bold text-emerald-400">Answer received.</p>}
        {error && <p className="mt-4 text-center text-sm font-bold text-rose-300">{error}</p>}
      </section>
    </main>
  );
}
