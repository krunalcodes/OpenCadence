import type { ReceivedMessage } from "@workspace/integration-core";
import { classifyReceived, referencedIds } from "./reply-classifier";

const root = "<0199a000-0000-7000-8000-000000000001@example.com>";
const second = "<0199a000-0000-7000-8000-000000000002@example.com>";

function received(overrides: Partial<ReceivedMessage> = {}): ReceivedMessage {
  return {
    inReplyTo: root,
    references: [root],
    from: { email: "lead@customer.test" },
    receivedAt: new Date("2026-10-12T10:00:00Z"),
    headers: {},
    ...overrides,
  };
}

describe("referencedIds", () => {
  it("puts the direct parent first, then the newest references", () => {
    expect(
      referencedIds(
        received({ inReplyTo: second, references: [root, second] }),
      ),
    ).toEqual([second, root]);
  });

  it("includes the original message named inside a delivery report", () => {
    expect(
      referencedIds(
        received({
          inReplyTo: undefined,
          references: [],
          deliveryStatus: { originalMessageId: root },
        }),
      ),
    ).toEqual([root]);
  });

  it("names the original message of a delivery report before the thread", () => {
    expect(
      referencedIds(
        received({
          inReplyTo: second,
          references: [second],
          deliveryStatus: { originalMessageId: root },
        }),
      ),
    ).toEqual([root, second]);
  });
});

describe("classifyReceived", () => {
  it("treats a person answering in the thread as a reply", () => {
    expect(classifyReceived(received(), "me@sender.test").kind).toBe("reply");
  });

  it("ignores mail that references nothing", () => {
    expect(
      classifyReceived(
        received({ inReplyTo: undefined, references: [] }),
        "me@sender.test",
      ).kind,
    ).toBe("ignored");
  });

  it("ignores our own follow-up when it shows up in the mailbox", () => {
    expect(
      classifyReceived(
        received({ from: { email: "Me@Sender.test" } }),
        "me@sender.test",
      ).kind,
    ).toBe("ignored");
  });

  it("treats out of office and other automatic answers as auto-replies", () => {
    const cases: ReceivedMessage["headers"][] = [
      { "auto-submitted": "Auto-Replied" },
      { "auto-submitted": "auto-generated; reason=vacation" },
      { "x-autoreply": "yes" },
      { "x-autorespond": "Out of office" },
      { precedence: " Auto_Reply " },
    ];
    for (const headers of cases) {
      expect(
        classifyReceived(received({ headers }), "me@sender.test").kind,
      ).toBe("auto_reply");
    }
  });

  it("treats Auto-Submitted: no and ordinary precedence as a real reply", () => {
    expect(
      classifyReceived(
        received({
          headers: { "auto-submitted": "no ; note", precedence: "bulk" },
        }),
        "me@sender.test",
      ).kind,
    ).toBe("reply");
  });

  it("records a bounce for a permanent failure in a delivery report", () => {
    expect(
      classifyReceived(
        received({
          from: { email: "MAILER-DAEMON@mx.customer.test" },
          deliveryStatus: { action: "failed", status: "5.1.1" },
        }),
        "me@sender.test",
      ).kind,
    ).toBe("bounce");
    expect(
      classifyReceived(
        received({
          from: { email: "postmaster@customer.test" },
          headers: { "x-failed-recipients": "lead@customer.test" },
        }),
        "me@sender.test",
      ).kind,
    ).toBe("bounce");
    expect(
      classifyReceived(
        received({
          inReplyTo: undefined,
          references: [],
          from: { email: "bounces@relay.customer.test" },
          deliveryStatus: {
            action: " Failed ",
            status: "5.7.1",
            originalMessageId: root,
            failedRecipient: "lead@customer.test",
          },
        }),
        "me@sender.test",
      ),
    ).toEqual({ kind: "bounce", references: [root] });
  });

  it("needs both a failed action and a 5.x.x status to call a report a bounce", () => {
    const reports: ReceivedMessage["deliveryStatus"][] = [
      { action: "failed" },
      { status: "5.1.1" },
      { action: "failed", status: "5" },
      { action: "failed", status: "4.5.1" },
      { action: "relayed", status: "5.1.1" },
      { action: "delivered", status: "2.0.0" },
      {},
    ];
    for (const deliveryStatus of reports) {
      expect(
        classifyReceived(
          received({
            from: { email: "mailer-daemon@mx.customer.test" },
            headers: {
              "content-type":
                "multipart/report; report-type=delivery-status; boundary=x",
              "x-failed-recipients": "lead@customer.test",
            },
            deliveryStatus,
          }),
          "me@sender.test",
        ).kind,
      ).toBe("ignored");
    }
    expect(
      classifyReceived(
        received({
          from: { email: "mailer-daemon@mx.customer.test" },
          headers: {
            "content-type":
              "multipart/report; report-type=delivery-status; boundary=x",
            "x-failed-recipients": "lead@customer.test",
          },
        }),
        "me@sender.test",
      ).kind,
    ).toBe("ignored");
  });

  it("never counts a delay notice or an unreadable daemon message as a reply or a bounce", () => {
    expect(
      classifyReceived(
        received({
          from: { email: "mailer-daemon@mx.customer.test" },
          deliveryStatus: { action: "delayed", status: "4.4.1" },
        }),
        "me@sender.test",
      ).kind,
    ).toBe("ignored");
    expect(
      classifyReceived(
        received({
          from: { email: "someone@customer.test" },
          deliveryStatus: { action: "failed", status: "4.2.2" },
        }),
        "me@sender.test",
      ).kind,
    ).toBe("ignored");
    expect(
      classifyReceived(
        received({ from: { email: "mailer-daemon@mx.customer.test" } }),
        "me@sender.test",
      ).kind,
    ).toBe("ignored");
    expect(
      classifyReceived(
        received({
          headers: {
            "content-type":
              "Multipart/Report; report-type=delivery-status; boundary=x",
          },
        }),
        "me@sender.test",
      ).kind,
    ).toBe("ignored");
  });
});
