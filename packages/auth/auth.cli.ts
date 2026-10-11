import { createDb } from "@workspace/db";
import { createAuth } from "./src/auth";

export const auth = createAuth({
  db: createDb("postgres://opencadence:opencadence@localhost:5432/opencadence"),
  mailer: {
    sendVerificationEmail: async () => {},
    sendPasswordResetEmail: async () => {},
  },
  secret: "schema-generation-only-not-a-real-secret",
  baseURL: "http://localhost:3000",
});
