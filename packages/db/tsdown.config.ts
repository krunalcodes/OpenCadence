import { defineConfig } from "tsdown";

export default defineConfig((options) => ({
  entry: ["src/index.ts", "src/schema/index.ts"],
  format: "esm",
  platform: "node",
  fixedExtension: false,
  dts: true,
  clean: !options.watch,
}));
