import { defineConfig } from "tsdown";

export default defineConfig((options) => ({
  entry: ["src/index.ts"],
  format: "esm",
  platform: "neutral",
  fixedExtension: false,
  dts: true,
  clean: !options.watch,
}));
