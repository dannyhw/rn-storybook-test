#!/usr/bin/env node
import arg from "arg";
import { execSync } from "child_process";
import { existsSync } from "fs";
import path from "path";
import { generateMaestroTest } from "./utils/maestro-generator.js";
import { buildStorybookIndex } from "./utils/storybook-index.js";

function showHelp() {
  console.log(`
Usage: npx rn-storybook-test screenshot-stories [options]

Generate Maestro capture + assert flows (using /select-story-sync/:storyId) and optionally run the assert flow.

Options:
  -c, --config-dir <path>        Path to Storybook config directory (default: ./.rnstorybook)
  -o, --output-dir <path>        Output directory for maestro files (default: ./.maestro)
  -a, --app-id <id>              App ID for maestro tests (default: host.exp.Exponent)
  -u, --base-uri <uri>           Base URI for deep links (default: exp://127.0.0.1:8081/--/)
  -n, --test-name <name>         Name for the maestro test file (default: storybook-screenshots)
  -s, --screenshots-dir <path>   Directory containing reference screenshots (default: ./.maestro/screenshots)
  --skip-generate                Skip generating maestro test file
  --skip-test                    Skip running maestro tests
  -h, --help                     Show this help message

Examples:
  npx rn-storybook-test screenshot-stories
  npx rn-storybook-test screenshot-stories --skip-test
  npx rn-storybook-test screenshot-stories --skip-generate
`);
}

const run = async () => {
  const args = arg({
    // Types
    "--help": Boolean,
    "--config-dir": String,
    "--output-dir": String,
    "--app-id": String,
    "--base-uri": String,
    "--test-name": String,
    "--screenshots-dir": String,
    "--skip-generate": Boolean,
    "--skip-test": Boolean,

    // Aliases
    "-h": "--help",
    "-c": "--config-dir",
    "-o": "--output-dir",
    "-a": "--app-id",
    "-u": "--base-uri",
    "-n": "--test-name",
    "-s": "--screenshots-dir",
  });

  if (args["--help"]) {
    showHelp();
    process.exit(0);
  }

  const configDir = args["--config-dir"] || "./.rnstorybook";
  const outputDir = args["--output-dir"] || "./.maestro";
  const appId = args["--app-id"] || "host.exp.Exponent";
  const baseUri = args["--base-uri"] || "exp://127.0.0.1:8081/--/";
  const testName = args["--test-name"] || "storybook-screenshots";
  const screenshotsDir =
    args["--screenshots-dir"] || path.join(outputDir, "screenshots");
  const skipGenerate = args["--skip-generate"] || false;
  const skipTest = args["--skip-test"] || false;

  try {
    const resolvedOutputDir = path.isAbsolute(outputDir)
      ? outputDir
      : path.join(process.cwd(), outputDir);

    if (!skipGenerate) {
      console.log("\n📝 Generating Maestro test file...");

      const resolvedConfigDir = path.isAbsolute(configDir)
        ? configDir
        : path.join(process.cwd(), configDir);

      const index = await buildStorybookIndex(resolvedConfigDir);

      const success = await generateMaestroTest({
        index,
        outputDir: resolvedOutputDir,
        appId,
        baseUri,
        testName,
        screenshotsRelativePath: screenshotsDir,
      });

      if (!success) {
        console.error("Failed to generate Maestro test file");
        process.exit(1);
      }
    }

    const maestroTestPath = path.join(resolvedOutputDir, `${testName}.yaml`);

    if (!skipTest) {
      console.log("\n🎯 Running Maestro tests...");

      if (!existsSync(maestroTestPath)) {
        console.error(`Maestro test file not found at: ${maestroTestPath}`);
        console.error(
          "Run without --skip-generate to generate the test file first",
        );
        process.exit(1);
      }

      execSync(`maestro test ${maestroTestPath}`, {
        stdio: "inherit",
        env: { ...process.env },
      });

      console.log("✅ Maestro tests completed successfully");
    }
  } catch (err: any) {
    console.error("Error:", err.message);
    process.exit(1);
  }
};

run();
