"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

const demoQuiz = {
  id: "adewale-demo-2026",
  name: "Adewale STEM Contest Demo",
  questions: [
    {
      id: "demo-1",
      text: "Which data structure follows the FIFO principle?",
      options: { A: "Stack", B: "Queue", C: "Tree", D: "Graph" },
      correctAnswer: "B",
      timeLimitSeconds: 30,
      explanation: "A queue is First In, First Out."
    },
    {
      id: "demo-2",
      text: "What is the SI unit of electric current?",
      options: { A: "Volt", B: "Ohm", C: "Ampere", D: "Watt" },
      correctAnswer: "C",
      timeLimitSeconds: 30,
      explanation: "Electric current is measured in amperes."
    },
    {
      id: "demo-3",
      text: "What is the derivative of x²?",
      options: { A: "x", B: "2x", C: "x²", D: "2" },
      correctAnswer: "B",
      timeLimitSeconds: 30,
      explanation: "By the power rule, d(x²)/dx = 2x."
    },
    {
      id: "demo-4",
      text: "Which organelle is primarily responsible for ATP production?",
      options: { A: "Nucleus", B: "Ribosome", C: "Mitochondrion", D: "Golgi apparatus" },
      correctAnswer: "C",
      timeLimitSeconds: 30,
      explanation: "Mitochondria produce most cellular ATP through cellular respiration."
    },
    {
      id: "demo-5",
      text: "Which programming value is commonly used to represent a true/false condition?",
      options: { A: "Boolean", B: "String", C: "Array", D: "Float" },
      correctAnswer: "A",
      timeLimitSeconds: 30,
      explanation: "A Boolean represents one of two logical states: true or false."
    }
  ]
};

type LiveState = {
  roomCode: string;
  state: string;
  currentIndex: number;
  totalQuestions: number;
  participantCount: number;
  question?: { text: string; options: Record<string, string>; timeLimitSeconds: number };
};

export default function Host() {
  const socketRef = useRef<Socket | null>(null);
  const [roomCode, setRoomCode] = useState("");
  const [state, setState] = useState<LiveState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roomCode) return;

    const socket = io(window.location.origin, {
      path: "/api/socket.io",
      transports: ["websocket", "polling"],
      reconnection: true
    });
    socketRef.current = socket;

    socket.on("session:state", (nextState: LiveState) => {
      setState(nextState);
      setError(null);
    });
    socket.on("session:participant_count", ({ count }: { count: number }) => {
      setState((current) => current ? { ...current, participantCount: count } : current);
    });
    socket.on("session:error", ({ message }: { message: string }) => setError(message));

    socket.on("connect", () => {
      socket.emit("session:join", {
        roomCode,
        displayName: "Host"
      });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomCode]);

  async function launchDemo() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(demoQuiz)
      });
      if (!response.ok) throw new Error("Could not create the demo session.");
      const created = await response.json();
      setRoomCode(created.roomCode);
      setState(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create session.");
    } finally {
      setBusy(false);
    }
  }

  function action(action: "start" | "next" | "reveal" | "leaderboard" | "end") {
    const socket = socketRef.current;
    if (!socket?.connected) {
      setError("Host connection is not ready.");
      return;
    }
    setBusy(true);
    socket.emit("host:action", { roomCode, action }, (result: LiveState & { error?: string }) => {
      setBusy(false);
      if (result?.error) setError(result.error);
      else setState(result);
    });
  }

  return (
    <main className="min-h-screen grid-bg p-6 md:p-10">
      <div className="mx-auto max-w-6xl">
        <p className="text-sm font-black uppercase tracking-[.2em] text-amber-700">Host console</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="text-4xl font-black tracking-tight md:text-6xl">Live control room</h1>
            <p className="mt-3 max-w-2xl text-slate-600">
              Launch a demo, display the room code, then control the competition from this screen.
            </p>
          </div>
          {!roomCode && (
            <button
              onClick={launchDemo}
              disabled={busy}
              className="rounded-xl bg-[#0b1730] px-6 py-4 font-bold text-white disabled:opacity-50"
            >
              {busy ? "Creating..." : "Launch demo contest"}
            </button>
          )}
        </div>

        {error && <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4 font-semibold text-rose-700">{error}</div>}

        {roomCode && (
          <div className="mt-8 grid gap-5 md:grid-cols-[1.2fr_.8fr]">
            <section className="rounded-3xl bg-[#0b1730] p-8 text-white shadow-xl">
              <p className="text-xs font-black uppercase tracking-[.25em] text-amber-400">Contest room</p>
              <div className="mt-3 text-7xl font-black tracking-[.18em]">{roomCode}</div>
              <p className="mt-4 text-slate-300">Contestants join at the Join page using this code.</p>
              <div className="mt-8 flex gap-8 text-sm font-bold">
                <span>{state?.participantCount ?? 0} contestants</span>
                <span>{state?.state ?? "LOBBY"}</span>
              </div>
            </section>

            <section className="rounded-3xl border bg-white p-6 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[.2em] text-slate-500">Controls</p>
              <div className="mt-5 grid grid-cols-2 gap-3">
                {([
                  ["start", "Start"],
                  ["reveal", "Reveal"],
                  ["leaderboard", "Leaderboard"],
                  ["next", "Next question"],
                  ["end", "End contest"]
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => action(key)}
                    disabled={busy || (key === "start" && state?.state !== "LOBBY")}
                    className="rounded-xl border border-slate-200 px-4 py-3 text-left font-bold transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}

        {state?.question && (
          <section className="mt-5 rounded-3xl border bg-white p-8 shadow-sm">
            <div className="flex justify-between text-xs font-black uppercase tracking-[.2em] text-slate-500">
              <span>Question {state.currentIndex + 1} / {state.totalQuestions}</span>
              <span>{state.question.timeLimitSeconds}s</span>
            </div>
            <h2 className="mt-5 text-3xl font-black">{state.question.text}</h2>
            <div className="mt-6 grid gap-3 md:grid-cols-2">
              {Object.entries(state.question.options).map(([key, value]) => (
                <div key={key} className="rounded-xl border bg-slate-50 p-4">
                  <span className="mr-3 font-black">{key}</span>{value}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
