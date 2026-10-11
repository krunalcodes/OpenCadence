import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { FastifyAdapter } from "@bull-board/fastify";
import { Injectable } from "@nestjs/common";
import type { Queue } from "bullmq";

export const QUEUE_BOARD_PATH = "/queues";

@Injectable()
export class QueueBoard {
  private readonly serverAdapter = new FastifyAdapter().setBasePath(
    QUEUE_BOARD_PATH,
  );
  private readonly board = createBullBoard({
    queues: [],
    serverAdapter: this.serverAdapter,
    options: {
      uiConfig: { boardTitle: "OpenCadence queues" },
    },
  });
  private readonly registered = new Set<string>();

  register(queue: Queue) {
    if (this.registered.has(queue.name)) {
      return;
    }
    this.registered.add(queue.name);
    this.board.addQueue(new BullMQAdapter(queue));
  }

  plugin(): ReturnType<FastifyAdapter["registerPlugin"]> {
    return this.serverAdapter.registerPlugin();
  }
}
