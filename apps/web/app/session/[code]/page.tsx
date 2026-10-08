"use client";
import {useEffect,useState} from "react";
import {io} from "socket.io-client";
import {useParams} from "next/navigation";
const WS=process.env.NEXT_PUBLIC_WS_URL??"http://localhost:4000";
type Choice="A"|"B"|"C"|"D";
export default function Session(){
 const params=useParams<{code:string}>(); const [state,setState]=useState<any>(null); const [selected,setSelected]=useState<Choice>();
 useEffect(()=>{const name=sessionStorage.getItem("contestantName")??"Guest";const socket=io(WS);socket.on("session:state",setState);socket.emit("session:join",{sessionId:params.code,displayName:name});return()=>socket.disconnect()},[params.code]);
 if(!state?.question)return <main className="min-h-screen bg-[#0b1730] grid place-items-center p-6 text-white"><div className="text-center"><p className="text-sm font-black uppercase tracking-[.2em] text-amber-400">Room {params.code}</p><h1 className="mt-4 text-4xl font-black">Waiting for the host</h1><p className="mt-3 text-slate-400">Stay on this screen. The next question will appear automatically.</p></div></main>;
 return <main className="min-h-screen bg-[#0b1730] p-4 text-white md:p-10"><section className="mx-auto max-w-4xl"><div className="flex justify-between text-sm font-bold uppercase tracking-wider text-slate-300"><span>Question {state.currentIndex+1} / {state.totalQuestions}</span><span>{state.roomCode}</span></div><h1 className="mt-8 text-3xl font-black leading-tight md:text-5xl">{state.question.text}</h1><div className="mt-10 grid gap-3">{(["A","B","C","D"] as Choice[]).map(k=><button key={k} onClick={()=>setSelected(k)} className={`rounded-2xl border p-5 text-left text-lg font-bold ${selected===k?"border-amber-400 bg-amber-400/20":"border-white/15 bg-white/5"}`}><span className="mr-4 inline-grid h-9 w-9 place-items-center rounded-lg bg-white/10">{k}</span>{state.question.options[k]}</button>)}</div></section></main>;
}