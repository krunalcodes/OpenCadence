import { describe, expect, it } from "vitest";
import {
  buildConfirmationEmail,
  type ConfirmationBrand,
} from "./confirmation-email";

const confirmUrl = "https://app.example.com/f/confirm/abc_DEF-123";

const brand: ConfirmationBrand = {
  name: "Northwind",
  logoUrl: "https://cdn.example.com/logo.png",
  primaryColor: "#2563eb",
  backgroundColor: "#f4f4f5",
  contentColor: "#ffffff",
  textColor: "#18181b",
  fontStack: "Arial, Helvetica, sans-serif",
};

function build(overrides: Partial<ConfirmationBrand> = {}, subject = "Hi") {
  return buildConfirmationEmail({
    brand: { ...brand, ...overrides },
    subject,
    confirmUrl,
  });
}

describe("buildConfirmationEmail", () => {
  it("links the button and the fallback address to the confirm page", () => {
    const email = build();
    expect(email.html.split(`href="${confirmUrl}"`)).toHaveLength(3);
    expect(email.text).toContain(`Confirm subscription: ${confirmUrl}`);
    expect(email.html).toContain("emails from Northwind.");
    expect(email.text).toContain("emails from Northwind.");
    expect(email.html).toContain("You will not be subscribed.");
  });

  it("escapes the brand name everywhere it appears", () => {
    const name = `<script>alert("x")</script> & 'Co'`;
    const email = build({ name, logoUrl: null });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;Co&#39;",
    );
    const withLogo = build({ name });
    expect(withLogo.html).not.toContain("<script>");
    expect(withLogo.html).toContain(
      'alt="&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;Co&#39;"',
    );
  });

  it("escapes the subject in the title and keeps it on one line", () => {
    const email = build(
      {},
      'Confirm </title><img src=x onerror="1">\r\nBcc: a@b.c',
    );
    expect(email.subject).toBe(
      'Confirm </title><img src=x onerror="1"> Bcc: a@b.c',
    );
    expect(email.html).not.toContain("<img src=x");
    expect(email.html).toContain("&lt;/title&gt;&lt;img src=x");
  });

  it("falls back when the subject is empty and caps a long one", () => {
    expect(build({}, "  ").subject).toBe("Confirm your subscription");
    expect(build({}, "x".repeat(400)).subject).toHaveLength(150);
  });

  it("drops colours, fonts and logos that are not safe values", () => {
    const email = build({
      primaryColor: 'red;background:url("https://evil.example/x")',
      backgroundColor: '#fff"><script>',
      contentColor: "expression(alert(1))",
      textColor: "#12345",
      fontStack: 'Arial"; background: url(x)',
      logoUrl: "javascript:alert(1)",
    });
    expect(email.html).not.toContain("evil.example");
    expect(email.html).not.toContain("<script>");
    expect(email.html).not.toContain("expression(");
    expect(email.html).not.toContain("javascript:");
    expect(email.html).not.toContain("<img");
    expect(email.html).toContain("background-color:#2563eb");
    expect(email.html).toContain("font-family:Arial, Helvetica, sans-serif");
  });

  it("escapes a logo address and keeps the button readable on a light colour", () => {
    const email = build({
      logoUrl: 'https://cdn.example.com/a.png?x="><script>',
      primaryColor: "#FFF",
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("background-color:#fff;color:#18181b");
  });

  it("says us when there is no brand name", () => {
    const email = build({ name: "  ", logoUrl: null });
    expect(email.html).toContain("emails from us.");
  });

  it("refuses a confirm link that is not http or https", () => {
    expect(() =>
      buildConfirmationEmail({
        brand,
        subject: "Hi",
        confirmUrl: "javascript:alert(1)",
      }),
    ).toThrow(TypeError);
  });

  it("has no input for anything a visitor typed", () => {
    const email = build();
    expect(Object.keys(email).sort()).toEqual(["html", "subject", "text"]);
    expect(buildConfirmationEmail.length).toBe(1);
  });
});
