import { describe, expect, it } from "vitest";
import { bodyLimit } from "../src/content";
import { createOutlookAdapter } from "../src/index";
import {
  callAt,
  captureError,
  clientConfig,
  createFakeFetch,
  type FakeReply,
  graphError,
  inboxCredentials,
  sendCredentials,
} from "./helpers";

const base = "https://graph.microsoft.com/v1.0/me/messages";

const fullSelect =
  "?$select=subject,body,from,sender,toRecipients,sentDateTime,receivedDateTime";

function setup(replies: FakeReply[] = [], inboxAccess = true) {
  const fake = createFakeFetch(replies);
  const adapter = createOutlookAdapter({
    ...clientConfig,
    inboxAccess,
    fetch: fake.fetch,
  });
  const fetchReceived = (ref: string, credentials = inboxCredentials) => {
    if (!adapter.inbox?.fetchReceived) {
      throw new Error("The adapter cannot fetch received mail");
    }
    return adapter.inbox.fetchReceived(credentials, ref);
  };
  return { adapter, fetchReceived, calls: fake.calls };
}

const htmlMessage = {
  body: {
    subject: "Re: Quarterly update",
    body: { contentType: "html", content: "<p>Sounds good</p>" },
    from: {
      emailAddress: { name: "Grace Hopper", address: "grace@customer.example" },
    },
    toRecipients: [
      { emailAddress: { name: "Ada", address: "ada@example.com" } },
      { emailAddress: { name: "No address" } },
    ],
    sentDateTime: "2026-10-02T08:59:30Z",
    receivedDateTime: "2026-10-02T09:00:00Z",
  },
};

describe("fetchReceived", () => {
  it("reads an html message and asks once more for its text form", async () => {
    const { fetchReceived, calls } = setup([
      htmlMessage,
      { body: { body: { contentType: "text", content: "Sounds good" } } },
    ]);
    const content = await fetchReceived("AAkALgAA-reply=");
    expect(content).toEqual({
      subject: "Re: Quarterly update",
      text: "Sounds good",
      html: "<p>Sounds good</p>",
      from: { email: "grace@customer.example", name: "Grace Hopper" },
      to: ["ada@example.com"],
      date: new Date("2026-10-02T08:59:30Z"),
    });
    expect(calls).toHaveLength(2);
    expect(callAt(calls, 0).url).toBe(`${base}/AAkALgAA-reply%3D${fullSelect}`);
    expect(callAt(calls, 0).headers.get("prefer")).toBe('IdType="ImmutableId"');
    expect(callAt(calls, 1).url).toBe(`${base}/AAkALgAA-reply%3D?$select=body`);
    expect(callAt(calls, 1).headers.get("prefer")).toBe(
      'IdType="ImmutableId", outlook.body-content-type="text"',
    );
    for (const call of calls) {
      expect(call.method).toBe("GET");
      expect(call.body).toBe("");
      expect(call.url.toLowerCase()).not.toContain("isread");
      expect(call.headers.get("authorization")).toBe(
        "Bearer access-token-value",
      );
    }
  });

  it("reads a plain text message with one request", async () => {
    const { fetchReceived, calls } = setup([
      {
        body: {
          subject: "Hi",
          body: { contentType: "text", content: "Just text" },
          sender: { emailAddress: { address: "grace@customer.example" } },
          receivedDateTime: "2026-10-02T09:00:00Z",
        },
      },
    ]);
    expect(await fetchReceived("ref-1")).toEqual({
      subject: "Hi",
      text: "Just text",
      html: null,
      from: { email: "grace@customer.example" },
      to: [],
      date: new Date("2026-10-02T09:00:00Z"),
    });
    expect(calls).toHaveLength(1);
  });

  it("tolerates missing fields and caps the body size", async () => {
    const { fetchReceived } = setup([
      {
        body: {
          body: { contentType: "html", content: "x".repeat(bodyLimit + 50) },
        },
      },
      graphError(404, "ErrorItemNotFound"),
    ]);
    const content = await fetchReceived("ref-1");
    expect(content?.subject).toBe("");
    expect(content?.html).toHaveLength(bodyLimit);
    expect(content?.text).toBeNull();
    expect(content?.from).toBeNull();
    expect(content?.date).toBeNull();
  });

  it("returns null for a message that is gone or a reference it cannot use", async () => {
    const gone = setup([graphError(404, "ErrorItemNotFound")]);
    expect(await gone.fetchReceived("ref-1")).toBeNull();
    const invalid = setup();
    expect(await invalid.fetchReceived("")).toBeNull();
    expect(await invalid.fetchReceived("has space")).toBeNull();
    expect(await invalid.fetchReceived("x".repeat(2000))).toBeNull();
    expect(invalid.calls).toHaveLength(0);
  });

  it("maps failures and needs the inbox permission", async () => {
    const throttled = setup([
      graphError(429, "TooManyRequests", "Slow.", { "retry-after": "4" }),
    ]);
    const error = await captureError(() => throttled.fetchReceived("ref-1"));
    expect(error.code).toBe("rate_limited");
    expect(error.retryAfterSeconds).toBe(4);

    const denied = setup();
    const scopeError = await captureError(() =>
      denied.fetchReceived("ref-1", sendCredentials),
    );
    expect(scopeError.code).toBe("insufficient_permission");
    expect(denied.calls).toHaveLength(0);
  });
});

describe("adapter", () => {
  it("declares sending only when inbox access is not requested", () => {
    const { adapter } = setup([], false);
    expect(adapter.type).toBe("outlook");
    expect(adapter.name).toBe("Outlook");
    expect(adapter.auth).toBe("oauth2");
    expect(adapter.capabilities).toEqual(["send"]);
    expect(adapter.inbox).toBeUndefined();
    expect(adapter.webhooks).toBeUndefined();
  });

  it("declares replies, and never warm-up, with inbox access", () => {
    const { adapter } = setup();
    expect(adapter.capabilities).toEqual(["send", "replies"]);
    expect(adapter.inbox?.listReceived).toBeTypeOf("function");
    expect(adapter.inbox?.fetchReceived).toBeTypeOf("function");
  });

  it("refuses the inbox operations that would change the mailbox", async () => {
    const { adapter, calls } = setup();
    const inbox = adapter.inbox;
    if (!inbox) {
      throw new Error("The adapter has no inbox");
    }
    const search = await captureError(() =>
      inbox.search(inboxCredentials, {
        messageId: "<a@example.com>",
        since: new Date(),
        includeSpam: true,
      }),
    );
    expect(search.code).toBe("insufficient_permission");
    const folder = await captureError(() =>
      inbox.ensureFolder(inboxCredentials, "Warm-up"),
    );
    expect(folder.code).toBe("insufficient_permission");
    const ref = { providerMessageId: "id-1" };
    expect(
      await inbox.applyActions(inboxCredentials, ref, [
        { type: "markRead" },
        { type: "star" },
        { type: "markRead" },
      ]),
    ).toEqual({ ref, unsupported: ["markRead", "star"] });
    expect(calls).toHaveLength(0);
  });
});
