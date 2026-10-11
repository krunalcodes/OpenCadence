import { defineConfig } from "tsdown";

export default defineConfig((options) => ({
  entry: ["src/index.ts"],
  format: "esm",
  platform: "node",
  dts: true,
  fixedExtension: false,
  clean: !options.watch,
}));
