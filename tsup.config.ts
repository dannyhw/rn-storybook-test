import { defineConfig } from "tsup";

export default defineConfig((options) => {
  return {
    entry: [
      "src/cli.ts",
      "src/gen-maestro.ts",
      "src/screenshot-stories.ts",
      "src/screenshot-stories-ws.ts",
      "src/compare-screenshots.ts",
      "src/detect-ignore-regions.ts",
    ],
    clean: !options.watch,
    dts: !options.watch
      ? {
          entry: [
            "src/cli.ts",
            "src/gen-maestro.ts",
            "src/screenshot-stories.ts",
            "src/screenshot-stories-ws.ts",
            "src/compare-screenshots.ts",
            "src/detect-ignore-regions.ts",
          ],
          resolve: true,
        }
      : false,
    format: ["cjs"],
  };
});
