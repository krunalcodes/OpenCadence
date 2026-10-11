import type { EmailProvider } from "./provider";

const rule = "-".repeat(64);

export function createConsoleProvider(): EmailProvider {
  return {
    async send({ from, to, subject, text }) {
      const block = [
        "",
        rule,
        "System email (console provider, nothing was sent)",
        rule,
        `From:    ${from}`,
        `To:      ${to}`,
        `Subject: ${subject}`,
        rule,
        text,
        rule,
        "",
      ].join("\n");
      process.stdout.write(`${block}\n`);
    },
  };
}
