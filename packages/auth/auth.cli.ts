import { createDb } from "@workspace/db";
import { type Auth, createAuth } from "./src/auth";

export const auth: Auth = createAuth({
  db: createDb("postgres://opencadence:opencadence@localhost:5432/opencadence"),
  mailer: {
    sendVerificationEmail: async () => {},
    sendPasswordResetEmail: async () => {},
    sendWorkspaceInvitationEmail: async () => {},
    sendEmailChangeEmail: async () => {},
  },
  secret: "schema-generation-only-not-a-real-secret",
  baseURL: "http://localhost:3000",
});
