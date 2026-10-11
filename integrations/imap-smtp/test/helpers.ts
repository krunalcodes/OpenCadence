import type { PasswordCredentials } from "@workspace/integration-core";
import type {
  FetchQueryObject,
  ImapFlowOptions,
  MessageStructureObject,
  SearchObject,
} from "imapflow";
import type { SendMailOptions, SMTPTransportOptions } from "nodemailer";
import {
  createImapSmtpAdapter,
  type ImapClient,
  type ImapConnector,
  type ImapFetchedMessage,
  type SmtpTransportFactory,
} from "../src/index";

export const credentials: PasswordCredentials = {
  kind: "password",
  username: "ada@example.com",
  password: "s3cret-Passw0rd!",
  smtp: { host: "smtp.example.com", port: 465, security: "tls" },
  imap: { host: "imap.example.com", port: 143, security: "starttls" },
};

export type FakeMessage = {
  uid: number;
  messageId: string;
  flags?: string[];
  labels?: string[];
  subject?: string;
  inReplyTo?: string;
  references?: string;
  internalDate?: Date;
  date?: Date;
  from?: { name?: string; address?: string }[];
  to?: { name?: string; address?: string }[];
  rawHeaders?: string[];
  bodyStructure?: MessageStructureObject;
  parts?: Record<string, string | Buffer>;
};

export type FakeMailbox = {
  path: string;
  specialUse?: string;
  messages?: FakeMessage[];
  nextUid?: number;
  uidValidity?: bigint;
  hideUidNext?: boolean;
};

export type SoftMethod = "search" | "messageMove" | "messageFlagsAdd";

export type HardMethod =
  | "connect"
  | "list"
  | "mailboxOpen"
  | "mailboxCreate"
  | "fetchOne"
  | "fetchAll"
  | "logout";

export type FakeImapSetup = {
  mailboxes?: FakeMailbox[];
  gmail?: boolean;
  uidPlus?: boolean;
  throws?: Partial<Record<HardMethod, Error>>;
  reports?: Partial<Record<SoftMethod, Error | null>>;
};

export type ImapCall = [method: string, ...args: unknown[]];

export function imapError(message: string, fields: Record<string, unknown>) {
  return Object.assign(new Error(message), fields);
}

export function smtpError(
  message: string,
  code: string,
  responseCode?: number,
  response?: string,
  extra: Record<string, unknown> = {},
) {
  return Object.assign(new Error(message), {
    code,
    responseCode,
    response,
    ...extra,
  });
}

function sameDayOrAfter(date: Date, since: Date) {
  const floor = Date.UTC(
    since.getUTCFullYear(),
    since.getUTCMonth(),
    since.getUTCDate(),
  );
  return date.getTime() >= floor;
}

function uidsInRange(range: string, uids: number[]) {
  const highest = Math.max(0, ...uids);
  const bounds = range
    .split(":")
    .map((bound) => (bound === "*" ? highest : Number(bound)));
  const low = Math.min(...bounds);
  const high = Math.max(...bounds);
  return uids.filter((uid) => uid >= low && uid <= high);
}

function headerBlock(message: FakeMessage, wanted: unknown) {
  const lines = [
    ...(message.references ? [`References: ${message.references}`] : []),
    ...(message.rawHeaders ?? []),
  ];
  const names = Array.isArray(wanted)
    ? wanted.map((name) => String(name).toLowerCase())
    : null;
  const kept = lines.filter(
    (line) =>
      !names || names.includes(line.split(":")[0]?.trim().toLowerCase() ?? ""),
  );
  return Buffer.from(`${kept.map((line) => `${line}\r\n`).join("")}\r\n`);
}

export function createFakeImap(setup: FakeImapSetup = {}) {
  const mailboxes = (
    setup.mailboxes ?? [
      { path: "INBOX" },
      { path: "Junk", specialUse: "\\Junk" },
    ]
  ).map((mailbox) => ({
    ...mailbox,
    messages: [...(mailbox.messages ?? [])],
    nextUid: mailbox.nextUid ?? 500,
  }));
  const calls: ImapCall[] = [];
  const options: ImapFlowOptions[] = [];
  const clients: { closed: boolean }[] = [];
  const find = (path: string) =>
    mailboxes.find((mailbox) => mailbox.path === path);

  const connect: ImapConnector = (given) => {
    options.push(given);
    const state = { closed: false };
    clients.push(state);
    let selected: (typeof mailboxes)[number] | undefined;
    const hard = (method: HardMethod) => {
      const error = setup.throws?.[method];
      if (error) {
        throw error;
      }
    };
    const soft = (method: SoftMethod) => {
      const error = setup.reports?.[method];
      if (error === undefined) {
        return false;
      }
      if (error !== null && given.logger) {
        given.logger.warn({ err: error, cid: "fake" });
      }
      return true;
    };
    const toFetched = (
      message: FakeMessage,
      query: FetchQueryObject,
    ): ImapFetchedMessage => ({
      uid: message.uid,
      flags: new Set(message.flags ?? []),
      labels: setup.gmail ? new Set(message.labels ?? []) : undefined,
      envelope: {
        messageId: message.messageId,
        inReplyTo: message.inReplyTo,
        subject: message.subject,
        from: message.from,
        to: message.to,
        date: message.date,
      },
      internalDate: message.internalDate,
      headers: headerBlock(message, query.headers),
      bodyStructure: query.bodyStructure ? message.bodyStructure : undefined,
      bodyParts: query.bodyParts
        ? new Map(
            query.bodyParts.flatMap((part) => {
              const key = typeof part === "string" ? part : part.key;
              const content = message.parts?.[key];
              const length =
                typeof part === "string" ? undefined : part.maxLength;
              return content === undefined
                ? []
                : [
                    [
                      key.toLowerCase(),
                      (typeof content === "string"
                        ? Buffer.from(content)
                        : content
                      ).subarray(0, length),
                    ] as const,
                  ];
            }),
          )
        : undefined,
    });
    const client: ImapClient = {
      capabilities: new Map<string, boolean | number>([
        ["IMAP4REV1", true],
        ...(setup.gmail ? ([["X-GM-EXT-1", true]] as const) : []),
      ]),
      on: (event) => {
        calls.push(["on", event]);
      },
      connect: async () => {
        calls.push(["connect"]);
        hard("connect");
      },
      logout: async () => {
        calls.push(["logout"]);
        hard("logout");
        state.closed = true;
      },
      close: () => {
        calls.push(["close"]);
        state.closed = true;
      },
      list: async () => {
        calls.push(["list"]);
        hard("list");
        return mailboxes.map((mailbox) => ({
          path: mailbox.path,
          name: mailbox.path.split("/").pop() ?? mailbox.path,
          specialUse: mailbox.specialUse,
        }));
      },
      mailboxOpen: async (path, openOptions) => {
        calls.push(["mailboxOpen", path, openOptions]);
        hard("mailboxOpen");
        selected = find(path);
        if (!selected) {
          throw imapError("Command failed", {
            responseStatus: "NO",
            responseText: "Mailbox doesn't exist",
            mailboxMissing: true,
          });
        }
        return {
          path,
          uidValidity: selected.uidValidity ?? 1n,
          uidNext: selected.hideUidNext
            ? undefined
            : Math.max(
                selected.nextUid,
                ...selected.messages.map((message) => message.uid + 1),
              ),
        };
      },
      mailboxCreate: async (path) => {
        calls.push(["mailboxCreate", path]);
        hard("mailboxCreate");
        if (!find(path)) {
          mailboxes.push({ path, messages: [], nextUid: 1 });
        }
        return { path, created: true };
      },
      search: async (query: SearchObject, searchOptions) => {
        calls.push(["search", selected?.path, query, searchOptions]);
        if (soft("search")) {
          return false;
        }
        const wanted = query.header?.["Message-ID"];
        const since = query.since instanceof Date ? query.since : undefined;
        if (typeof query.uid === "string") {
          return uidsInRange(
            query.uid,
            (selected?.messages ?? []).map((message) => message.uid),
          );
        }
        return (selected?.messages ?? [])
          .filter(
            (message) =>
              (query.header === undefined && since !== undefined) ||
              (typeof wanted === "string" &&
                message.messageId.includes(wanted)),
          )
          .filter(
            (message) =>
              !since ||
              sameDayOrAfter(message.internalDate ?? new Date(), since),
          )
          .map((message) => message.uid);
      },
      fetchOne: async (seq, query, fetchOptions) => {
        calls.push(["fetchOne", selected?.path, seq, query, fetchOptions]);
        hard("fetchOne");
        const message = selected?.messages.find(
          (entry) => String(entry.uid) === seq,
        );
        if (!message) {
          return false;
        }
        return toFetched(message, query);
      },
      fetchAll: async (range, query, fetchOptions) => {
        calls.push(["fetchAll", selected?.path, range, query, fetchOptions]);
        hard("fetchAll");
        const uids = range.split(",");
        return (selected?.messages ?? [])
          .filter((entry) => uids.includes(String(entry.uid)))
          .map((entry) => toFetched(entry, query));
      },
      messageMove: async (range, destination, moveOptions) => {
        calls.push([
          "messageMove",
          selected?.path,
          range,
          destination,
          moveOptions,
        ]);
        if (soft("messageMove")) {
          return false;
        }
        const target = find(destination);
        const index =
          selected?.messages.findIndex(
            (entry) => String(entry.uid) === range,
          ) ?? -1;
        if (!selected || !target || index < 0) {
          return false;
        }
        const [message] = selected.messages.splice(index, 1);
        if (!message) {
          return false;
        }
        const uid = target.nextUid;
        target.nextUid += 1;
        target.messages.push({ ...message, uid });
        return {
          path: selected.path,
          destination,
          uidMap:
            setup.uidPlus === false ? undefined : new Map([[message.uid, uid]]),
        };
      },
      messageFlagsAdd: async (range, flags, flagOptions) => {
        calls.push([
          "messageFlagsAdd",
          selected?.path,
          range,
          flags,
          flagOptions,
        ]);
        if (soft("messageFlagsAdd")) {
          return false;
        }
        const message = selected?.messages.find(
          (entry) => String(entry.uid) === range,
        );
        if (!message || (flagOptions?.useLabels && !setup.gmail)) {
          return false;
        }
        if (flagOptions?.useLabels) {
          message.labels = [...(message.labels ?? []), ...flags];
        } else {
          message.flags = [...(message.flags ?? []), ...flags];
        }
        return true;
      },
    };
    return client;
  };

  return {
    connect,
    calls,
    options,
    clients,
    mailbox: (path: string) => find(path),
    names: () => calls.map((call) => call[0]),
    allClosed: () =>
      clients.length > 0 && clients.every((client) => client.closed),
  };
}

export type FakeSmtpSetup = { verifyError?: Error; sendError?: Error };

export function createFakeSmtp(setup: FakeSmtpSetup = {}) {
  const options: SMTPTransportOptions[] = [];
  const mails: SendMailOptions[] = [];
  const calls: string[] = [];
  const transport: SmtpTransportFactory = (given) => {
    options.push(given);
    return {
      verify: async () => {
        calls.push("verify");
        if (setup.verifyError) {
          throw setup.verifyError;
        }
        return true;
      },
      sendMail: async (mail) => {
        calls.push("sendMail");
        mails.push(mail);
        if (setup.sendError) {
          throw setup.sendError;
        }
        return { messageId: mail.messageId };
      },
      close: () => {
        calls.push("close");
      },
    };
  };
  return { transport, options, mails, calls };
}

export function createAdapter(
  setup: { imap?: FakeImapSetup; smtp?: FakeSmtpSetup } = {},
) {
  const imap = createFakeImap(setup.imap);
  const smtp = createFakeSmtp(setup.smtp);
  const adapter = createImapSmtpAdapter({
    connect: imap.connect,
    transport: smtp.transport,
  });
  if (!adapter.inbox) {
    throw new Error("The adapter has no inbox support.");
  }
  return { adapter, inbox: adapter.inbox, imap, smtp };
}

export async function captureError(action: () => unknown) {
  try {
    await action();
  } catch (error) {
    return error;
  }
  throw new Error("Expected the action to throw.");
}

export function exposed(error: unknown) {
  const source = error as Record<string, unknown>;
  return [
    String(source.message),
    String(source.providerMessage),
    String(source.providerCode),
    JSON.stringify(error),
  ].join("\n");
}
