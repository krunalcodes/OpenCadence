import { randomBytes } from "node:crypto";
import type { ConfigService } from "@nestjs/config";
import type { Env } from "../../config/env";
import { CryptoService } from "./crypto.service";

type CryptoEnv = Pick<
  Env,
  | "CREDENTIALS_ENCRYPTION_KEY"
  | "CREDENTIALS_ENCRYPTION_KEY_VERSION"
  | "CREDENTIALS_ENCRYPTION_OLD_KEYS"
>;

function createService(env: CryptoEnv) {
  const config = {
    get: (key: keyof CryptoEnv) => env[key],
  } as unknown as ConfigService<Env, true>;
  return new CryptoService(config);
}

function createKey() {
  return randomBytes(32).toString("base64");
}

describe("CryptoService", () => {
  const firstKey = createKey();
  const secondKey = createKey();
  const aad = "source-1:credentials";

  const service = createService({
    CREDENTIALS_ENCRYPTION_KEY: firstKey,
    CREDENTIALS_ENCRYPTION_KEY_VERSION: 1,
    CREDENTIALS_ENCRYPTION_OLD_KEYS: [],
  });

  it("round trips a value through a wrapped data key", () => {
    const { dataKey, keyVersion, wrappedDataKey } = service.createDataKey();
    const ciphertext = service.encrypt(dataKey, "smtp-password ü", aad);

    expect(keyVersion).toBe(1);
    expect(dataKey).toHaveLength(32);
    expect(wrappedDataKey).toHaveLength(12 + 32 + 16);
    expect(ciphertext.includes(Buffer.from("smtp-password"))).toBe(false);

    const unwrapped = service.unwrapDataKey(keyVersion, wrappedDataKey);
    expect(unwrapped.equals(dataKey)).toBe(true);
    expect(service.decrypt(unwrapped, ciphertext, aad)).toBe("smtp-password ü");
  });

  it("fails when the aad differs", () => {
    const { dataKey } = service.createDataKey();
    const ciphertext = service.encrypt(dataKey, "secret", aad);

    expect(() =>
      service.decrypt(dataKey, ciphertext, "source-2:credentials"),
    ).toThrow("Decryption failed.");
  });

  it("fails when the ciphertext is tampered with", () => {
    const { dataKey, keyVersion, wrappedDataKey } = service.createDataKey();
    const ciphertext = service.encrypt(dataKey, "secret", aad);

    for (const index of [0, 12, ciphertext.length - 1]) {
      const tampered = Buffer.from(ciphertext);
      tampered[index] ^= 1;
      expect(() => service.decrypt(dataKey, tampered, aad)).toThrow(
        "Decryption failed.",
      );
    }
    expect(() => service.decrypt(dataKey, Buffer.alloc(8), aad)).toThrow(
      "Decryption failed.",
    );

    const tamperedKey = Buffer.from(wrappedDataKey);
    tamperedKey[20] ^= 1;
    expect(() => service.unwrapDataKey(keyVersion, tamperedKey)).toThrow(
      "Decryption failed.",
    );
  });

  it("fails on an unknown key version", () => {
    const { wrappedDataKey } = service.createDataKey();

    expect(() => service.unwrapDataKey(2, wrappedDataKey)).toThrow(
      "Unknown encryption key version.",
    );
    expect(() => service.rewrapDataKey(2, wrappedDataKey)).toThrow(
      "Unknown encryption key version.",
    );
  });

  it("decrypts with an old key and rewraps to the current version", () => {
    const old = service.createDataKey();
    const ciphertext = service.encrypt(old.dataKey, "secret", aad);

    const rotated = createService({
      CREDENTIALS_ENCRYPTION_KEY: secondKey,
      CREDENTIALS_ENCRYPTION_KEY_VERSION: 2,
      CREDENTIALS_ENCRYPTION_OLD_KEYS: [{ version: 1, key: firstKey }],
    });

    const dataKey = rotated.unwrapDataKey(old.keyVersion, old.wrappedDataKey);
    expect(rotated.decrypt(dataKey, ciphertext, aad)).toBe("secret");
    expect(rotated.createDataKey().keyVersion).toBe(2);

    const rewrapped = rotated.rewrapDataKey(old.keyVersion, old.wrappedDataKey);
    expect(rewrapped.keyVersion).toBe(2);
    expect(rewrapped.wrappedDataKey.equals(old.wrappedDataKey)).toBe(false);

    const withoutOldKey = createService({
      CREDENTIALS_ENCRYPTION_KEY: secondKey,
      CREDENTIALS_ENCRYPTION_KEY_VERSION: 2,
      CREDENTIALS_ENCRYPTION_OLD_KEYS: [],
    });
    const rewrappedDataKey = withoutOldKey.unwrapDataKey(
      rewrapped.keyVersion,
      rewrapped.wrappedDataKey,
    );
    expect(withoutOldKey.decrypt(rewrappedDataKey, ciphertext, aad)).toBe(
      "secret",
    );
    expect(() =>
      withoutOldKey.unwrapDataKey(old.keyVersion, old.wrappedDataKey),
    ).toThrow("Unknown encryption key version.");
  });

  it("does not unwrap a data key under a different version label", () => {
    const sameKeyTwoVersions = createService({
      CREDENTIALS_ENCRYPTION_KEY: firstKey,
      CREDENTIALS_ENCRYPTION_KEY_VERSION: 2,
      CREDENTIALS_ENCRYPTION_OLD_KEYS: [{ version: 1, key: firstKey }],
    });
    const { wrappedDataKey } = service.createDataKey();

    expect(() => sameKeyTwoVersions.unwrapDataKey(2, wrappedDataKey)).toThrow(
      "Decryption failed.",
    );
  });

  it("keeps a data key that is already on the current version", () => {
    const { keyVersion, wrappedDataKey } = service.createDataKey();

    expect(service.rewrapDataKey(keyVersion, wrappedDataKey)).toEqual({
      keyVersion,
      wrappedDataKey,
    });
  });

  it("produces different output for the same plaintext", () => {
    const { dataKey } = service.createDataKey();
    const first = service.encrypt(dataKey, "secret", aad);
    const second = service.encrypt(dataKey, "secret", aad);

    expect(first.equals(second)).toBe(false);
    expect(service.decrypt(dataKey, first, aad)).toBe("secret");
    expect(service.decrypt(dataKey, second, aad)).toBe("secret");
  });
});
