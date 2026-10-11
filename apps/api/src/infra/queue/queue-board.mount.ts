import { createHash, timingSafeEqual } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { Env } from "../../config/env";
import { QUEUE_BOARD_PATH, QueueBoard } from "./queue-board.service";

const BASIC_SCHEME = "basic ";

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

function matches(actual: string, expected: string) {
  return timingSafeEqual(digest(actual), digest(expected));
}

function isAuthorized(
  header: string | undefined,
  username: string,
  password: string,
) {
  if (!header?.toLowerCase().startsWith(BASIC_SCHEME)) {
    return false;
  }
  const decoded = Buffer.from(
    header.slice(BASIC_SCHEME.length).trim(),
    "base64",
  ).toString("utf8");
  const separator = decoded.indexOf(":");
  if (separator === -1) {
    return false;
  }
  const usernameMatches = matches(decoded.slice(0, separator), username);
  const passwordMatches = matches(decoded.slice(separator + 1), password);
  return usernameMatches && passwordMatches;
}

export async function mountQueueBoard(app: NestFastifyApplication) {
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const username = config.get("BULL_BOARD_USERNAME", { infer: true });
  const password = config.get("BULL_BOARD_PASSWORD", { infer: true });
  if (!username || !password) {
    return;
  }

  const board = app.get(QueueBoard);

  await app
    .getHttpAdapter()
    .getInstance()
    .register(
      async (scope) => {
        scope.addHook("onRequest", async (request, reply) => {
          if (isAuthorized(request.headers.authorization, username, password)) {
            return;
          }
          return reply
            .code(401)
            .header("WWW-Authenticate", 'Basic realm="Queues", charset="UTF-8"')
            .header("Cache-Control", "no-store")
            .send({ statusCode: 401, message: "Unauthorized" });
        });
        await scope.register(board.plugin());
      },
      { prefix: QUEUE_BOARD_PATH },
    );
}
