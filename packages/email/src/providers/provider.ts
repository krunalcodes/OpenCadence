export type EmailMessage = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type EmailProvider = {
  send(message: EmailMessage): Promise<void>;
};
