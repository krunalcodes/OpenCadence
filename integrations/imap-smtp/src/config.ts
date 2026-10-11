import {
  type Credentials,
  IntegrationError,
  type MailServer,
  type PasswordCredentials,
} from "@workspace/integration-core";
import {
  type CopyResponseObject,
  type FetchMessageObject,
  type FetchQueryObject,
  ImapFlow,
  type ImapFlowOptions,
  type ListResponse,
  type MailboxCreateResponse,
  type SearchObject,
} from "imapflow";
import nodemailer, {
  type SendMailOptions,
  type SMTPTransportOptions,
} from "nodemailer";

export type ImapMailbox = Pick<ListResponse, "path" | "name" | "specialUse">;

export type ImapFetchedMessage = Pick<
  FetchMessageObject,
  "uid" | "flags" | "labels" | "envelope" | "internalDate" | "headers"
>;

export type ImapMoveResult = Pick<CopyResponseObject, "destination" | "uidMap">;

export type ImapClient = {
  capabilities: Map<string, boolean | number>;
  on(event: "error", listener: (error: Error) => void): unknown;
  connect(): Promise<void>;
  logout(): Promise<void>;
  close(): void;
  list(): Promise<ImapMailbox[]>;
  mailboxOpen(path: string, options?: { readOnly?: boolean }): Promise<unknown>;
  mailboxCreate(path: string): Promise<Pick<MailboxCreateResponse, "path">>;
  search(
    query: SearchObject,
    options?: { uid?: boolean },
  ): Promise<number[] | false | undefined>;
  fetchOne(
    seq: string,
    query: FetchQueryObject,
    options?: { uid?: boolean },
  ): Promise<ImapFetchedMessage | false | undefined>;
  messageMove(
    range: string,
    destination: string,
    options?: { uid?: boolean },
  ): Promise<ImapMoveResult | false | undefined>;
  messageFlagsAdd(
    range: string,
    flags: string[],
    options?: { uid?: boolean; useLabels?: boolean },
  ): Promise<boolean>;
};

export type ImapConnector = (options: ImapFlowOptions) => ImapClient;

export type SmtpTransport = {
  verify(): Promise<unknown>;
  sendMail(mail: SendMailOptions): Promise<unknown>;
  close(): void;
};

export type SmtpTransportFactory = (
  options: SMTPTransportOptions,
) => SmtpTransport;

export type ImapSmtpAdapterConfig = {
  connect?: ImapConnector;
  transport?: SmtpTransportFactory;
  timeoutMs?: number;
};

export type ImapSmtpContext = {
  connect: ImapConnector;
  transport: SmtpTransportFactory;
  timeoutMs: number;
};

export const defaultTimeoutMs = 20_000;

const minimumTlsVersion = "TLSv1.2";

export function createContext(
  config: ImapSmtpAdapterConfig = {},
): ImapSmtpContext {
  return {
    connect: config.connect ?? ((options) => new ImapFlow(options)),
    transport:
      config.transport ?? ((options) => nodemailer.createTransport(options)),
    timeoutMs:
      config.timeoutMs && config.timeoutMs > 0
        ? config.timeoutMs
        : defaultTimeoutMs,
  };
}

function isMailServer(value: unknown): value is MailServer {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const server = value as Partial<MailServer>;
  return (
    typeof server.host === "string" &&
    server.host.trim() !== "" &&
    typeof server.port === "number" &&
    Number.isInteger(server.port) &&
    server.port > 0 &&
    server.port < 65536 &&
    (server.security === "tls" || server.security === "starttls")
  );
}

export function requirePassword(credentials: Credentials): PasswordCredentials {
  if (credentials.kind !== "password") {
    throw new IntegrationError(
      "invalid_credentials",
      "An IMAP/SMTP mailbox needs a username, a password and its server settings.",
    );
  }
  if (!credentials.username || !credentials.password) {
    throw new IntegrationError(
      "invalid_credentials",
      "The mailbox username and password are required.",
    );
  }
  if (!isMailServer(credentials.smtp) || !isMailServer(credentials.imap)) {
    throw new IntegrationError(
      "invalid_credentials",
      "The SMTP and IMAP server settings are incomplete.",
    );
  }
  return credentials;
}

export function smtpOptions(
  context: ImapSmtpContext,
  credentials: PasswordCredentials,
): SMTPTransportOptions {
  const implicitTls = credentials.smtp.security === "tls";
  return {
    host: credentials.smtp.host,
    port: credentials.smtp.port,
    secure: implicitTls,
    requireTLS: !implicitTls,
    auth: { user: credentials.username, pass: credentials.password },
    tls: { rejectUnauthorized: true, minVersion: minimumTlsVersion },
    connectionTimeout: context.timeoutMs,
    greetingTimeout: context.timeoutMs,
    socketTimeout: context.timeoutMs,
    dnsTimeout: context.timeoutMs,
    disableFileAccess: true,
    disableUrlAccess: true,
    logger: false,
  };
}

export function imapOptions(
  context: ImapSmtpContext,
  credentials: PasswordCredentials,
  logger: ImapFlowOptions["logger"],
): ImapFlowOptions {
  const implicitTls = credentials.imap.security === "tls";
  return {
    host: credentials.imap.host,
    port: credentials.imap.port,
    secure: implicitTls,
    doSTARTTLS: implicitTls ? undefined : true,
    auth: { user: credentials.username, pass: credentials.password },
    tls: { rejectUnauthorized: true, minVersion: minimumTlsVersion },
    connectionTimeout: context.timeoutMs,
    greetingTimeout: context.timeoutMs,
    socketTimeout: context.timeoutMs,
    disableAutoIdle: true,
    disableCompression: true,
    logger,
  };
}
