import {
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer
} from "@nestjs/websockets";
import { Server } from "socket.io";
import { SessionService } from "./session.service";

@WebSocketGateway({
  namespace: "/",
  path: "/api/socket.io",
  cors: { origin: true, credentials: true }
})
export class SessionGateway {
  @WebSocketServer()
  server!: Server;

  constructor(private readonly service: SessionService) {}

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
    const actions = {
      start: () => this.service.start(payload.roomCode),
      next: () => this.service.next(payload.roomCode),
      reveal: () => this.service.reveal(payload.roomCode),
      leaderboard: () => this.service.leaderboard(payload.roomCode),
      end: () => this.service.end(payload.roomCode)
    };
    const result = await actions[payload.action]();
    const session = await this.service.getSession(payload.roomCode);
    this.server.to(session.id).emit("session:state", result);
    return result;
  }
}