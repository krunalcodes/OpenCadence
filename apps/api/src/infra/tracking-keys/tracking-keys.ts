import { hkdfSync } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../config/env";

const KEY_BYTES = 32;
const LABEL = "opencadence-tracking";

export function deriveTrackingSecret(authSecret: string) {
  return Buffer.from(
    hkdfSync("sha256", authSecret, Buffer.alloc(0), LABEL, KEY_BYTES),
  );
}

@Injectable()
export class TrackingKeys {
  readonly secret: Buffer;
  readonly baseUrl: string;

  constructor(config: ConfigService<Env, true>) {
    this.secret = deriveTrackingSecret(
      config.get("BETTER_AUTH_SECRET", { infer: true }),
    );
    this.baseUrl = config.get("TRACKING_BASE_URL", { infer: true });
  }
}
