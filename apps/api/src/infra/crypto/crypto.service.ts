import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../config/env";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

function seal(key: Buffer, plaintext: Buffer, aad: string) {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, nonce, {
    authTagLength: TAG_BYTES,
  });
  cipher.setAAD(Buffer.from(aad, "utf8"));
  return Buffer.concat([
    nonce,
    cipher.update(plaintext),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
}

function open(key: Buffer, blob: Buffer, aad: string) {
  if (key.length !== KEY_BYTES || blob.length < NONCE_BYTES + TAG_BYTES) {
    throw new Error("Decryption failed.");
  }
  try {
    const decipher = createDecipheriv(
      ALGORITHM,
      key,
      blob.subarray(0, NONCE_BYTES),
      { authTagLength: TAG_BYTES },
    );
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(blob.subarray(blob.length - TAG_BYTES));
    return Buffer.concat([
      decipher.update(blob.subarray(NONCE_BYTES, blob.length - TAG_BYTES)),
      decipher.final(),
    ]);
  } catch {
    throw new Error("Decryption failed.");
  }
}

function wrapAad(keyVersion: number) {
  return `opencadence:data-key:v${keyVersion}`;
}

@Injectable()
export class CryptoService {
  private readonly currentVersion: number;
  private readonly keys = new Map<number, Buffer>();

  constructor(config: ConfigService<Env, true>) {
    this.currentVersion = config.get("CREDENTIALS_ENCRYPTION_KEY_VERSION", {
      infer: true,
    });
    for (const { version, key } of config.get(
      "CREDENTIALS_ENCRYPTION_OLD_KEYS",
      { infer: true },
    )) {
      this.keys.set(version, Buffer.from(key, "base64"));
    }
    this.keys.set(
      this.currentVersion,
      Buffer.from(
        config.get("CREDENTIALS_ENCRYPTION_KEY", { infer: true }),
        "base64",
      ),
    );
  }

  createDataKey() {
    const dataKey = randomBytes(KEY_BYTES);
    return {
      dataKey,
      keyVersion: this.currentVersion,
      wrappedDataKey: this.wrap(this.currentVersion, dataKey),
    };
  }

  unwrapDataKey(keyVersion: number, wrappedDataKey: Buffer) {
    return open(this.keyFor(keyVersion), wrappedDataKey, wrapAad(keyVersion));
  }

  rewrapDataKey(keyVersion: number, wrappedDataKey: Buffer) {
    if (keyVersion === this.currentVersion) {
      this.unwrapDataKey(keyVersion, wrappedDataKey);
      return { keyVersion, wrappedDataKey };
    }
    return {
      keyVersion: this.currentVersion,
      wrappedDataKey: this.wrap(
        this.currentVersion,
        this.unwrapDataKey(keyVersion, wrappedDataKey),
      ),
    };
  }

  encrypt(dataKey: Buffer, plaintext: string, aad: string) {
    if (dataKey.length !== KEY_BYTES) {
      throw new Error("Encryption failed.");
    }
    return seal(dataKey, Buffer.from(plaintext, "utf8"), aad);
  }

  decrypt(dataKey: Buffer, ciphertext: Buffer, aad: string) {
    return open(dataKey, ciphertext, aad).toString("utf8");
  }

  private wrap(keyVersion: number, dataKey: Buffer) {
    return seal(this.keyFor(keyVersion), dataKey, wrapAad(keyVersion));
  }

  private keyFor(keyVersion: number) {
    const key = this.keys.get(keyVersion);
    if (!key) {
      throw new Error("Unknown encryption key version.");
    }
    return key;
  }
}
