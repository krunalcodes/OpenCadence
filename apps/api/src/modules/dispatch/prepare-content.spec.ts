import {
  hasUnsubscribe,
  prepareContent,
  withoutMarker,
} from "./prepare-content";

const keys = {
  secret: Buffer.from("0123456789abcdef0123456789abcdef"),
  baseUrl: "https://mail.example.com/api/v1",
};

const message = {
  id: "0199d2a0-7c00-7000-8000-000000000001",
  trackOpens: false,
  trackClicks: false,
  unsubscribeListId: null,
};

const snapshot = {
  id: "0199d2a0-7c00-7000-8000-000000000002",
  workspaceId: "0199d2a0-7c00-7000-8000-000000000003",
  subject: "Hello",
  previewText: "",
  html: '<html><body><p>Hi {{first_name}}</p><a href="https://example.com/a">Offer</a></body></html>',
  text: "Hi {{first_name}}",
  createdAt: new Date(),
};

const stored = (headers: Record<string, string> = {}) => ({
  html: "<p>Total {{amount}}</p>",
  text: "Total {{amount}}",
  headers,
  snapshotId: null,
  variables: null,
});

describe("prepareContent", () => {
  it("passes stored content through untouched when nothing applies", () => {
    expect(
      prepareContent({
        message,
        content: stored({ "X-Order": "42" }),
        snapshot: null,
        keys,
      }),
    ).toEqual({
      html: "<p>Total {{amount}}</p>",
      text: "Total {{amount}}",
      headers: { "X-Order": "42" },
    });
  });

  it("never sends the internal marker header", () => {
    expect(
      withoutMarker({ "X-OpenCadence-Unsubscribe": "1", "X-Order": "42" }),
    ).toEqual({ "X-Order": "42" });
    expect(hasUnsubscribe(message, { "x-opencadence-unsubscribe": "1" })).toBe(
      true,
    );
    expect(hasUnsubscribe(message, {})).toBe(false);
    expect(hasUnsubscribe({ unsubscribeListId: "list" }, {})).toBe(true);
  });

  it("renders a snapshot with tracking and unsubscribe at send time", () => {
    const result = prepareContent({
      message: { ...message, trackOpens: true, trackClicks: true },
      content: {
        html: null,
        text: null,
        headers: { "x-opencadence-unsubscribe": "1" },
        snapshotId: snapshot.id,
        variables: { first_name: "Ada" },
      },
      snapshot,
      keys,
    });
    expect(result.html).toContain("Hi Ada");
    expect(result.html).toContain(`${keys.baseUrl}/t/o/`);
    expect(result.html).toContain(`${keys.baseUrl}/t/c/`);
    expect(result.html).toContain(`${keys.baseUrl}/t/u/`);
    expect(result.text).toContain("Hi Ada");
    const names = Object.keys(result.headers).map((name) => name.toLowerCase());
    expect(names).toContain("list-unsubscribe");
    expect(names).not.toContain("x-opencadence-unsubscribe");
  });

  it("renders a preview without tracking or a live unsubscribe link", () => {
    const result = prepareContent({
      message: { ...message, trackOpens: true, trackClicks: true },
      content: {
        html: null,
        text: null,
        headers: { "x-opencadence-unsubscribe": "1" },
        snapshotId: snapshot.id,
        variables: { first_name: "Ada" },
      },
      snapshot,
      keys,
      preview: true,
    });
    expect(result.html).toContain("Hi Ada");
    expect(result.html).not.toContain("/t/");
    expect(result.headers).toEqual({});
  });
});
