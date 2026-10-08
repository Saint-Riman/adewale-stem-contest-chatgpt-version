import {
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer
} from "@nestjs/websockets";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import { Server } from "socket.io";
import { SessionService } from "./session.service";

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
    await Promise.all([pub.connect(), sub.connect()]);
    server.adapter(createAdapter(pub, sub));
  }

  @SubscribeMessage("session:join")
  async join(
    client: any,
    payload: { roomCode: string; displayName: string; contestantId?: string }
  ) {
    const participant = await this.service.join(
      payload.roomCode,
      payload.displayName,
      payload.contestantId
    );
    const session = await this.service.getSession(payload.roomCode);
    client.join(session.id);
    client.emit("session:state", await this.service.snapshot(session.id));
    this.server.to(session.id).emit("session:participant_count", {
      count: session.participants.size
    });
    return participant;
  }

  @SubscribeMessage("answer:submit")
  async answer(
    client: any,
    payload: {
      roomCode: string;
      participantId: string;
      choice: "A" | "B" | "C" | "D";
    }
  ) {
    const result = await this.service.answer(
      payload.roomCode,
      payload.participantId,
      payload.choice
    );
    client.emit("answer:accepted", result);
    return result;
  }

  @SubscribeMessage("host:action")
  async action(
    client: any,
    payload: {
      roomCode: string;
      action: "start" | "next" | "reveal" | "leaderboard" | "end";
    }
  ) {
    const action = payload.action;
    let result;
    if (action === "start") result = await this.service.start(payload.roomCode);
    else if (action === "next") result = await this.service.next(payload.roomCode);
    else if (action === "reveal") result = await this.service.reveal(payload.roomCode);
    else if (action === "leaderboard") result = await this.service.leaderboard(payload.roomCode);
    else result = await this.service.end(payload.roomCode);

    const session = await this.service.getSession(payload.roomCode);
    this.server.to(session.id).emit("session:state", result);
    return result;
  }
}