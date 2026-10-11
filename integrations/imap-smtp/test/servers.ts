import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import tls from "node:tls";

export type Certificate = { key: string; cert: string };

export type Security = "tls" | "starttls";

export type Account = { username: string; password: string };

export type ScriptedServer = {
  port: number;
  commands: string[];
  close(): Promise<void>;
};

export function createCertificate(): Certificate | null {
  const directory = mkdtempSync(join(tmpdir(), "opencadence-imap-smtp-"));
  try {
    const keyPath = join(directory, "key.pem");
    const certPath = join(directory, "cert.pem");
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-keyout",
        keyPath,
        "-out",
        certPath,
        "-days",
        "2",
        "-subj",
        "/CN=127.0.0.1",
        "-addext",
        "subjectAltName=IP:127.0.0.1",
      ],
      { stdio: "ignore", timeout: 30_000 },
    );
    return {
      key: readFileSync(keyPath, "utf8"),
      cert: readFileSync(certPath, "utf8"),
    };
  } catch {
    return null;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

type Connection = {
  write(line: string): void;
  end(): void;
  upgrade(): void;
};

type LineHandler = (line: string, connection: Connection) => void;

function listen(
  certificate: Certificate,
  security: Security,
  greet: (connection: Connection) => void,
  createHandler: () => LineHandler,
  commands: string[],
): Promise<ScriptedServer> {
  const sockets = new Set<net.Socket>();

  const serve = (plain: net.Socket, secured: net.Socket | null) => {
    const handler = createHandler();
    let stream: net.Socket = secured ?? plain;
    let buffered = "";
    const connection: Connection = {
      write: (line) => {
        if (!stream.destroyed) {
          stream.write(`${line}\r\n`);
        }
      },
      end: () => stream.end(),
      upgrade: () => {
        plain.removeAllListeners("data");
        buffered = "";
        const upgraded = new tls.TLSSocket(plain, {
          isServer: true,
          secureContext: tls.createSecureContext(certificate),
        });
        upgraded.on("error", () => {});
        stream = upgraded;
        read(upgraded);
      },
    };
    const read = (source: net.Socket) => {
      source.on("data", (chunk: Buffer) => {
        buffered += chunk.toString("utf8");
        let index = buffered.indexOf("\r\n");
        while (index >= 0) {
          const line = buffered.slice(0, index);
          buffered = buffered.slice(index + 2);
          handler(line, connection);
          index = buffered.indexOf("\r\n");
        }
      });
    };
    read(stream);
    greet(connection);
  };

  const track = (socket: net.Socket) => {
    sockets.add(socket);
    socket.on("error", () => {});
    socket.on("close", () => sockets.delete(socket));
  };

  const server =
    security === "tls"
      ? tls.createServer(certificate, (socket) => serve(socket, socket))
      : net.createServer((socket) => serve(socket, null));
  server.on("connection", track);
  server.on("tlsClientError", () => {});

  return new Promise<ScriptedServer>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("The test server has no port."));
        return;
      }
      resolve({
        port: address.port,
        commands,
        close: () =>
          new Promise((done) => {
            for (const socket of sockets) {
              socket.destroy();
            }
            server.close(() => done());
          }),
      });
    });
  });
}

function plainLogin(encoded: string): Account {
  const [, username = "", password = ""] = Buffer.from(encoded, "base64")
    .toString("utf8")
    .split("\0");
  return { username, password };
}

type StoredMessage = { uid: number; flags: Set<string>; labels: Set<string> };

export type ImapScript = {
  account: Account;
  gmail?: boolean;
  uidPlus?: boolean;
};

const imapMessage = {
  messageId: "<warm-1@sender.example>",
  envelope:
    '("Sat, 10 Oct 2026 08:30:00 +0000" "Lunch on Friday?" (("Grace Hopper" NIL "grace" "sender.example")) (("Grace Hopper" NIL "grace" "sender.example")) (("Grace Hopper" NIL "grace" "sender.example")) ((NIL NIL "ada" "example.com")) NIL NIL "<warm-0@sender.example>" "<warm-1@sender.example>")',
  internalDate: "10-Oct-2026 08:30:00 +0000",
  references:
    "References: <root@sender.example>\r\n <warm-0@sender.example>\r\n\r\n",
};

export function startImapServer(
  certificate: Certificate,
  security: Security,
  script: ImapScript,
): Promise<ScriptedServer> {
  const mailboxes = new Map<string, StoredMessage[]>([
    ["INBOX", []],
    ["Junk", [{ uid: 31, flags: new Set(), labels: new Set() }]],
  ]);
  const nextUid = new Map<string, number>([["INBOX", 500]]);
  const capabilities = (secure: boolean) =>
    [
      "IMAP4rev1",
      "NAMESPACE",
      "SPECIAL-USE",
      "MOVE",
      ...(script.uidPlus === false ? [] : ["UIDPLUS"]),
      ...(script.gmail ? ["X-GM-EXT-1"] : []),
      ...(secure ? ["AUTH=PLAIN"] : ["STARTTLS", "LOGINDISABLED"]),
    ].join(" ");
  const commands: string[] = [];

  const createHandler = (): LineHandler => {
    let secure = security === "tls";
    let authTag: string | undefined;
    let selected: string | undefined;
    return (line, connection) => {
      if (authTag) {
        const tag = authTag;
        authTag = undefined;
        const given = plainLogin(line);
        if (
          given.username === script.account.username &&
          given.password === script.account.password
        ) {
          connection.write(`${tag} OK [CAPABILITY ${capabilities(true)}] Done`);
        } else {
          connection.write(
            `${tag} NO [AUTHENTICATIONFAILED] Invalid credentials (Failure)`,
          );
        }
        return;
      }
      const match = line.match(/^(\S+) (UID )?(\S+) ?(.*)$/i);
      if (!match) {
        connection.write("* BAD Could not parse the command");
        return;
      }
      const tag = match[1] ?? "*";
      const command = `${match[2] ? "UID " : ""}${(match[3] ?? "").toUpperCase()}`;
      const args = match[4] ?? "";
      commands.push(`${command} ${args}`.trim());
      const ok = (text = "Done") => connection.write(`${tag} OK ${text}`);
      const path = (value: string) => value.replace(/^"|"$/g, "");
      const messages = () => mailboxes.get(selected ?? "") ?? [];

      switch (command) {
        case "CAPABILITY":
          connection.write(`* CAPABILITY ${capabilities(secure)}`);
          ok();
          return;
        case "STARTTLS":
          ok("Begin TLS negotiation now");
          secure = true;
          connection.upgrade();
          return;
        case "AUTHENTICATE":
          authTag = tag;
          connection.write("+ ");
          return;
        case "NAMESPACE":
          connection.write('* NAMESPACE (("" "/")) NIL NIL');
          ok();
          return;
        case "LIST":
          if (/^"" ""/.test(args)) {
            connection.write('* LIST (\\Noselect) "/" ""');
          } else {
            const pattern = path(args.split(" ").slice(1).join(" "));
            for (const name of mailboxes.keys()) {
              if (!/[*%]/.test(pattern) && pattern !== name) {
                continue;
              }
              const flags =
                name === "Junk" ? "\\HasNoChildren \\Junk" : "\\HasNoChildren";
              connection.write(`* LIST (${flags}) "/" "${name}"`);
            }
          }
          ok();
          return;
        case "LSUB":
          for (const name of mailboxes.keys()) {
            connection.write(`* LSUB () "/" "${name}"`);
          }
          ok();
          return;
        case "SELECT":
        case "EXAMINE": {
          const name = path(args.split(" ")[0] ?? "");
          if (!mailboxes.has(name)) {
            connection.write(`${tag} NO Unknown Mailbox: ${name}`);
            return;
          }
          selected = name;
          connection.write(
            "* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)",
          );
          connection.write(
            "* OK [PERMANENTFLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft \\*)] Flags permitted",
          );
          connection.write(`* ${messages().length} EXISTS`);
          connection.write("* 0 RECENT");
          connection.write("* OK [UIDVALIDITY 9] UIDs valid");
          connection.write("* OK [UIDNEXT 900] Predicted next UID");
          ok(command === "SELECT" ? "[READ-WRITE] Done" : "[READ-ONLY] Done");
          return;
        }
        case "UID SEARCH": {
          const found = args.includes(imapMessage.messageId)
            ? messages().map((message) => message.uid)
            : [];
          connection.write(`* SEARCH${found.map((uid) => ` ${uid}`).join("")}`);
          ok();
          return;
        }
        case "UID FETCH": {
          const uid = Number(args.split(" ")[0]);
          const index = messages().findIndex((entry) => entry.uid === uid);
          const message = messages()[index];
          if (message) {
            const items = [
              `UID ${message.uid}`,
              `FLAGS (${[...message.flags].join(" ")})`,
            ];
            if (/INTERNALDATE/i.test(args)) {
              items.push(`INTERNALDATE "${imapMessage.internalDate}"`);
            }
            if (/ENVELOPE/i.test(args)) {
              items.push(`ENVELOPE ${imapMessage.envelope}`);
            }
            if (/X-GM-LABELS/i.test(args)) {
              items.push(`X-GM-LABELS (${[...message.labels].join(" ")})`);
            }
            if (/HEADER\.FIELDS/i.test(args)) {
              items.push(
                `BODY[HEADER.FIELDS (REFERENCES)] {${Buffer.byteLength(imapMessage.references)}}\r\n${imapMessage.references}`,
              );
            }
            connection.write(`* ${index + 1} FETCH (${items.join(" ")})`);
          }
          ok();
          return;
        }
        case "UID MOVE": {
          const [range = "", target = ""] = args.split(" ");
          const destination = path(target);
          const index = messages().findIndex(
            (entry) => entry.uid === Number(range),
          );
          const message = messages()[index];
          const into = mailboxes.get(destination);
          if (!into) {
            connection.write(`${tag} NO [TRYCREATE] Mailbox doesn't exist`);
            return;
          }
          if (message) {
            const uid = nextUid.get(destination) ?? 1;
            nextUid.set(destination, uid + 1);
            messages().splice(index, 1);
            into.push({ ...message, uid });
            if (script.uidPlus !== false) {
              connection.write(`* OK [COPYUID 9 ${message.uid} ${uid}] Moved`);
            }
            connection.write(`* ${index + 1} EXPUNGE`);
          }
          ok();
          return;
        }
        case "UID STORE": {
          const [range = "", item = "", ...rest] = args.split(" ");
          const index = messages().findIndex(
            (entry) => entry.uid === Number(range),
          );
          const message = messages()[index];
          const values = rest.join(" ").replace(/[()]/g, "").split(" ");
          if (message) {
            const set = /X-GM-LABELS/i.test(item)
              ? message.labels
              : message.flags;
            for (const value of values) {
              set.add(value);
            }
            connection.write(
              `* ${index + 1} FETCH (UID ${message.uid} FLAGS (${[...message.flags].join(" ")}))`,
            );
          }
          ok();
          return;
        }
        case "CREATE": {
          const name = path(args);
          if (mailboxes.has(name)) {
            connection.write(
              `${tag} NO [ALREADYEXISTS] Mailbox already exists`,
            );
            return;
          }
          mailboxes.set(name, []);
          ok();
          return;
        }
        case "LOGOUT":
          connection.write("* BYE Logging out");
          ok();
          connection.end();
          return;
        case "SUBSCRIBE":
        case "NOOP":
        case "CLOSE":
        case "UNSELECT":
          ok();
          return;
        default:
          connection.write(`${tag} BAD Unknown command`);
      }
    };
  };

  return listen(
    certificate,
    security,
    (connection) =>
      connection.write(
        `* OK [CAPABILITY ${capabilities(security === "tls")}] Scripted IMAP ready`,
      ),
    createHandler,
    commands,
  );
}

export type SmtpScript = {
  account: Account;
  rejectRecipient?: string;
};

export type ScriptedSmtpServer = ScriptedServer & { messages: string[] };

export function startSmtpServer(
  certificate: Certificate,
  security: Security,
  script: SmtpScript,
): Promise<ScriptedSmtpServer> {
  const received: string[] = [];
  const commands: string[] = [];

  const createHandler = (): LineHandler => {
    let secure = security === "tls";
    let data: string[] | undefined;
    return (line, connection) => {
      if (data) {
        if (line === ".") {
          received.push(data.join("\r\n"));
          data = undefined;
          connection.write("250 2.0.0 OK queued");
        } else {
          data.push(line);
        }
        return;
      }
      const verb = line.split(" ")[0]?.toUpperCase() ?? "";
      commands.push(verb === "AUTH" ? "AUTH" : line);
      if (verb === "EHLO") {
        connection.write("250-scripted.test");
        connection.write(secure ? "250-AUTH PLAIN" : "250-STARTTLS");
        connection.write("250 ENHANCEDSTATUSCODES");
        return;
      }
      if (verb === "STARTTLS") {
        connection.write("220 2.0.0 Ready to start TLS");
        secure = true;
        connection.upgrade();
        return;
      }
      if (verb === "AUTH") {
        const given = plainLogin(line.split(" ")[2] ?? "");
        connection.write(
          given.username === script.account.username &&
            given.password === script.account.password
            ? "235 2.7.0 Accepted"
            : "535 5.7.8 Username and Password not accepted.",
        );
        return;
      }
      if (verb === "MAIL") {
        connection.write("250 2.1.0 OK");
        return;
      }
      if (verb === "RCPT") {
        connection.write(
          script.rejectRecipient && line.includes(script.rejectRecipient)
            ? "550 5.1.1 The email account that you tried to reach does not exist."
            : "250 2.1.5 OK",
        );
        return;
      }
      if (verb === "DATA") {
        data = [];
        connection.write("354 Go ahead");
        return;
      }
      if (verb === "QUIT") {
        connection.write("221 2.0.0 Bye");
        connection.end();
        return;
      }
      connection.write(verb === "RSET" ? "250 2.0.0 OK" : "502 5.5.1 Unknown");
    };
  };

  return listen(
    certificate,
    security,
    (connection) => connection.write("220 scripted.test ESMTP ready"),
    createHandler,
    commands,
  ).then((server) => ({ ...server, messages: received }));
}
