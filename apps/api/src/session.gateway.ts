import {
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer
} from "@nestjs/websockets";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import { Server, Socket } from "socket.io";
import { SessionService } from "./session.service";

type Choice = "A" | "B" | "C" | "D";

@WebSocketGateway({
  path: "/api/socket.io",
  cors: { origin: true, credentials: true }
})
export class SessionGateway implements OnGatewayInit {
  @WebSocketServer()
  server!: Server;

  constructor(private readonly service: SessionService) {}

  async afterInit(server: Server) {
    if (!process.env.REDIS_URL) return;

    const pub = createClient({ url: process.env.REDIS_URL });
    const sub = pub.duplicate();
    pub.on("error", (error) => console.error("Redis publisher error", error));
    sub.on("error", (error) => console.error("Redis subscriber error", error));

    await Promise.all([pub.connect(), sub.connect()]);
    server.adapter(createAdapter(pub, sub));
  }

  @SubscribeMessage("session:join")
  async join(
    client: Socket,
    payload: { roomCode?: string; displayName?: string; contestantId?: string }
  ) {
    try {
      const roomCode = String(payload.roomCode ?? "").trim().toUpperCase();
      const displayName = String(payload.displayName ?? "").trim();
      if (!roomCode || !displayName) throw new Error("Room code and name are required");

      const participant = await this.service.join(roomCode, displayName, payload.contestantId);
      const session = await this.service.getSession(roomCode);

      client.join(session.id);
      client.emit("session:state", await this.service.snapshot(session.id));
      this.server.to(session.id).emit("session:participant_count", {
        count: session.participants.size
      });

      return participant;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to join session";
      client.emit("session:error", { message });
      return { error: message };
    }
  }

  @SubscribeMessage("answer:submit")
  async answer(
    client: Socket,
    payload: { roomCode?: string; participantId?: string; choice?: Choice }
  ) {
    try {
      const choice = payload.choice;
      if (!choice || !["A", "B", "C", "D"].includes(choice)) {
        throw new Error("Invalid answer choice");
      }

      const result = await this.service.answer(
        String(payload.roomCode ?? "").trim().toUpperCase(),
        String(payload.participantId ?? ""),
        choice
      );

      client.emit("answer:accepted", result);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Answer was rejected";
      client.emit("answer:error", { message });
      return { accepted: false, error: message };
    }
  }

  @SubscribeMessage("host:action")
  async action(
    client: Socket,
    payload: {
      roomCode?: string;
      action?: "start" | "next" | "reveal" | "leaderboard" | "end";
    }
  ) {
    try {
      const roomCode = String(payload.roomCode ?? "").trim().toUpperCase();
      if (!payload.action) throw new Error("Host action is required");

      let result;
      if (payload.action === "start") result = await this.service.start(roomCode);
      else if (payload.action === "next") result = await this.service.next(roomCode);
      else if (payload.action === "reveal") result = await this.service.reveal(roomCode);
      else if (payload.action === "leaderboard") result = await this.service.leaderboard(roomCode);
      else if (payload.action === "end") result = await this.service.end(roomCode);

      const session = await this.service.getSession(roomCode);
      this.server.to(session.id).emit("session:state", result);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Host action failed";
      client.emit("session:error", { message });
      return { error: message };
    }
  }
}
