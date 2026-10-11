import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: "./",
    include: ["**/*.e2e-spec.ts"],
    env: {
      DATABASE_URL:
        "postgres://opencadence:opencadence@localhost:5432/opencadence",
      BETTER_AUTH_SECRET: "test-only-secret-that-is-long-enough-0123456789",
      BETTER_AUTH_URL: "http://localhost:3000",
      EMAIL_PROVIDER: "console",
      CREDENTIALS_ENCRYPTION_KEY:
        "dGVzdC1vbmx5LWNyZWRlbnRpYWxzLWtleS0wMDAwMDA=",
    },
  },
});
