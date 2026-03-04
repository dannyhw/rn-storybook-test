#!/usr/bin/env node
import path from "path";
import arg from "arg";
import { generateMaestroTest } from "./utils/maestro-generator.js";
import { buildStorybookIndex } from "./utils/storybook-index.js";

function showHelp() {
  console.log(`
Usage: npx rn-storybook-test gen-maestro [options]

Generate Maestro capture + assert flows for Storybook stories using /select-story-sync/:storyId

Options:
  -c, --config-dir <path>   Path to Storybook config directory (default: ./.rnstorybook)
  -o, --output-dir <path>   Output directory for maestro files (default: ./.maestro)
  -a, --app-id <id>         App ID for maestro tests (default: host.exp.Exponent)
  -u, --base-uri <uri>      Base URI for deep links (default: exp://127.0.0.1:8081/--/)
  -n, --test-name <name>    Name for the maestro test file (default: storybook-screenshots)
  -s, --screenshots-dir <path>   Directory containing reference screenshots (default: ./.maestro/screenshots)
  -h, --help                Show this help message

Examples:
  npx rn-storybook-test gen-maestro
  npx rn-storybook-test gen-maestro --app-id com.myapp --config-dir ./storybook
  npx rn-storybook-test gen-maestro -a com.myapp -o ./e2e/maestro
`);
}

const run = async () => {
  let args;

  try {
    args = arg({
      // Types
      '--help': Boolean,
      '--config-dir': String,
      '--output-dir': String,
      '--app-id': String,
      '--base-uri': String,
      '--test-name': String,
      '--screenshots-dir': String,

      // Aliases
      '-h': '--help',
      '-c': '--config-dir',
      '-o': '--output-dir',
      '-a': '--app-id',
      '-u': '--base-uri',
      '-n': '--test-name',
      '-s': '--screenshots-dir',
    });
  } catch (err: any) {
    console.error(err.message);
    showHelp();
    process.exit(1);
  }

  if (args['--help']) {
    showHelp();
    process.exit(0);
  }

  // Set defaults
  const configDir = args["--config-dir"] || "./.rnstorybook";
  const outputDir = args["--output-dir"] || "./.maestro";
  const appId = args["--app-id"] || "host.exp.Exponent";
  const baseUri = args["--base-uri"] || "exp://127.0.0.1:8081/--/";
  const testName = args["--test-name"] || "storybook-screenshots";
  const screenshotsDir = args["--screenshots-dir"] || `${outputDir}/screenshots`;

  try {
    // Resolve config directory relative to current working directory
    const resolvedConfigDir = path.isAbsolute(configDir)
      ? configDir
      : path.join(process.cwd(), configDir);

    console.log(`Building story index from: ${resolvedConfigDir}`);

    const index = await buildStorybookIndex(resolvedConfigDir);

    // Ensure output directory exists
    const resolvedOutputDir = path.isAbsolute(outputDir)
      ? outputDir
      : path.join(process.cwd(), outputDir);

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

    const maestroTestPath = path.join(resolvedOutputDir, `${testName}.yaml`);
    const maestroCapturePath = path.join(
      resolvedOutputDir,
      `${testName}.capture.yaml`
    );
    console.log(`\n✅ Generated Maestro test file: ${maestroTestPath}`);
    console.log(`✅ Generated Maestro capture flow: ${maestroCapturePath}`);
    console.log("\nTo run the tests:");
    console.log(`  maestro test ${maestroTestPath}`);
    console.log(`\nTo capture baseline screenshots:`);
    console.log(`  maestro test ${maestroCapturePath}`);
  } catch (err: any) {
    console.error("Error generating Maestro test file:", err.message);
    process.exit(1);
  }
};

run();
