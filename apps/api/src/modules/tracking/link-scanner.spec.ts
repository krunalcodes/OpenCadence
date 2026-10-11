import { describe, expect, it } from "vitest";
import { isLinkScanner, isPrefetch } from "./link-scanner";
import { clientIp, maskEmail, visitorOf } from "./request-info";

describe("isLinkScanner", () => {
  it("treats mail clients, browsers and image proxies as people", () => {
    for (const userAgent of [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 5.1; rv:11.0) Gecko Firefox/11.0 (via ggpht.com GoogleImageProxy)",
      "YahooMailProxy; https://help.yahoo.com/kb/yahoo-mail-proxy-SLN28749.html",
      "Mozilla/5.0",
      "Microsoft Office/16.0 (Windows NT 10.0; Microsoft Outlook 16.0.17328; Pro)",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
      "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36",
      "Thunderbird/115.0",
    ]) {
      expect(isLinkScanner(userAgent), userAgent).toBe(false);
    }
  });

  it("treats scanners, scripts and missing user agents as scanners", () => {
    for (const userAgent of [
      undefined,
      null,
      "",
      "   ",
      "Mozilla/5.0 (compatible; Proofpoint Essentials)",
      "Mimecast-URL-Scanner",
      "Barracuda Sentinel (EE)",
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
      "python-requests/2.31.0",
      "curl/8.4.0",
      "Wget/1.21",
      "Go-http-client/2.0",
      "Java/17.0.2",
      "okhttp/4.12.0",
      "axios/1.6.0",
      "node-fetch/1.0",
      "Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/120.0",
      "facebookexternalhit/1.1",
      "WhatsApp/2.23",
    ]) {
      expect(isLinkScanner(userAgent), String(userAgent)).toBe(true);
    }
  });
});

describe("isPrefetch", () => {
  const now = new Date("2026-01-01T00:00:10.000Z");

  it("is true before the send and for two seconds after it", () => {
    expect(isPrefetch(null, now)).toBe(true);
    expect(isPrefetch(new Date("2026-01-01T00:00:09.000Z"), now)).toBe(true);
    expect(isPrefetch(new Date("2026-01-01T00:00:08.001Z"), now)).toBe(true);
    expect(isPrefetch(new Date("2026-01-01T00:00:11.000Z"), now)).toBe(true);
  });

  it("is false from two seconds after the send", () => {
    expect(isPrefetch(new Date("2026-01-01T00:00:08.000Z"), now)).toBe(false);
    expect(isPrefetch(new Date("2025-12-01T00:00:00.000Z"), now)).toBe(false);
  });
});

describe("clientIp", () => {
  it("uses the address the nearest proxy saw", () => {
    expect(
      clientIp({
        ip: "10.0.0.1",
        headers: { "x-forwarded-for": "1.1.1.1, 2.2.2.2 , 3.3.3.3" },
      }),
    ).toBe("3.3.3.3");
    expect(
      clientIp({
        ip: "10.0.0.1",
        headers: { "x-forwarded-for": ["1.1.1.1", "4.4.4.4"] },
      }),
    ).toBe("4.4.4.4");
  });

  it("falls back to the connection address", () => {
    expect(clientIp({ ip: "10.0.0.1", headers: {} })).toBe("10.0.0.1");
    expect(
      clientIp({ ip: "10.0.0.1", headers: { "x-forwarded-for": " , " } }),
    ).toBe("10.0.0.1");
    expect(clientIp({ headers: {} })).toBe("unknown");
  });

  it("reads the user agent", () => {
    expect(
      visitorOf({ ip: "10.0.0.1", headers: { "user-agent": "Thing/1" } }),
    ).toEqual({ ip: "10.0.0.1", userAgent: "Thing/1" });
  });
});

describe("maskEmail", () => {
  it("keeps the first character and the domain", () => {
    expect(maskEmail("ada@example.com")).toBe("a***@example.com");
    expect(maskEmail("a@example.com")).toBe("a***@example.com");
    expect(maskEmail('"odd@name"@example.com')).toBe('"***@example.com');
  });

  it("hides anything that is not an address", () => {
    expect(maskEmail("nope")).toBe("***");
    expect(maskEmail("@example.com")).toBe("***");
  });
});
