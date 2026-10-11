import { Inject, Injectable } from "@nestjs/common";
import type {
  Credentials,
  OAuthCredentials,
  PasswordCredentials,
} from "@workspace/integration-core";
import { CryptoService } from "../../infra/crypto/crypto.service";
import type {
  CredentialsRow,
  NewCredentialsRow,
} from "./sending-sources.repository";

type SealInput = {
  sourceId: string;
  workspaceId: string;
  credentials: Credentials;
};

function aad(sourceId: string, column: string) {
  return `${sourceId}:${column}`;
}

@Injectable()
export class CredentialsService {
  constructor(@Inject(CryptoService) private readonly crypto: CryptoService) {}

  seal({ sourceId, workspaceId, credentials }: SealInput): NewCredentialsRow {
    const { dataKey, keyVersion, wrappedDataKey } = this.crypto.createDataKey();
    const base = { sourceId, workspaceId, keyVersion, wrappedDataKey };

    if (credentials.kind === "api_key") {
      return {
        ...base,
        authType: "api_key",
        secretCiphertext: this.crypto.encrypt(
          dataKey,
          credentials.apiKey,
          aad(sourceId, "secret"),
        ),
        secretHint: credentials.apiKey.slice(-4),
      };
    }

    if (credentials.kind === "password") {
      return {
        ...base,
        authType: "password",
        secretCiphertext: this.crypto.encrypt(
          dataKey,
          JSON.stringify({
            username: credentials.username,
            password: credentials.password,
            smtp: credentials.smtp,
            imap: credentials.imap,
          }),
          aad(sourceId, "secret"),
        ),
      };
    }

    return {
      ...base,
      authType: "oauth2",
      secretCiphertext: this.crypto.encrypt(
        dataKey,
        credentials.refreshToken,
        aad(sourceId, "secret"),
      ),
      accessTokenCiphertext: credentials.accessToken
        ? this.crypto.encrypt(
            dataKey,
            credentials.accessToken,
            aad(sourceId, "access_token"),
          )
        : null,
      accessTokenExpiresAt: credentials.accessTokenExpiresAt ?? null,
      scopes: credentials.scopes,
    };
  }

  open(row: CredentialsRow): Credentials {
    const dataKey = this.dataKey(row);
    const secret = this.crypto.decrypt(
      dataKey,
      row.secretCiphertext,
      aad(row.sourceId, "secret"),
    );

    if (row.authType === "api_key") {
      return { kind: "api_key", apiKey: secret };
    }

    if (row.authType === "password") {
      const parsed = JSON.parse(secret) as Omit<PasswordCredentials, "kind">;
      return { kind: "password", ...parsed };
    }

    return {
      kind: "oauth2",
      refreshToken: secret,
      accessToken: row.accessTokenCiphertext
        ? this.crypto.decrypt(
            dataKey,
            row.accessTokenCiphertext,
            aad(row.sourceId, "access_token"),
          )
        : undefined,
      accessTokenExpiresAt: row.accessTokenExpiresAt ?? undefined,
      scopes: row.scopes ?? [],
    };
  }

  sealRefreshed(
    row: CredentialsRow,
    credentials: OAuthCredentials,
  ): Partial<NewCredentialsRow> {
    const dataKey = this.dataKey(row);
    return {
      secretCiphertext: this.crypto.encrypt(
        dataKey,
        credentials.refreshToken,
        aad(row.sourceId, "secret"),
      ),
      accessTokenCiphertext: credentials.accessToken
        ? this.crypto.encrypt(
            dataKey,
            credentials.accessToken,
            aad(row.sourceId, "access_token"),
          )
        : null,
      accessTokenExpiresAt: credentials.accessTokenExpiresAt ?? null,
      scopes: credentials.scopes,
    };
  }

  sealWebhookSecret(row: CredentialsRow, signingSecret: string) {
    return this.crypto.encrypt(
      this.dataKey(row),
      signingSecret,
      aad(row.sourceId, "webhook_secret"),
    );
  }

  openWebhookSecret(row: CredentialsRow) {
    if (!row.webhookSecretCiphertext) {
      return null;
    }
    return this.crypto.decrypt(
      this.dataKey(row),
      row.webhookSecretCiphertext,
      aad(row.sourceId, "webhook_secret"),
    );
  }

  private dataKey(row: CredentialsRow) {
    return this.crypto.unwrapDataKey(row.keyVersion, row.wrappedDataKey);
  }
}
