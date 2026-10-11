import { Resend } from "resend";
import type { EmailProvider } from "./provider";

export function createResendProvider(apiKey: string): EmailProvider {
  const resend = new Resend(apiKey);

  return {
    async send({ from, to, subject, html, text }) {
      const { error } = await resend.emails.send({
        from,
        to,
        subject,
        html,
        text,
      });

      if (error) {
        throw new Error(
          `Resend could not send "${subject}": ${error.name}: ${error.message}`,
        );
      }
    },
  };
}
