#!/usr/bin/env node
import arg from "arg";
import { existsSync, mkdirSync } from "fs";
import path from "path";
import { buildIndex } from "storybook/internal/core-server";
import type { IndexEntry } from "storybook/internal/types";
import { snapshotStorybookViaWebsocket } from "./utils/websocket-snapshot.js";
import {
  compareScreenshots,
  updateBaseline as updateBaselineUtil,
  clearDirectory,
  generateHtmlReport,
  parseIgnoreRegions,
} from "./utils/screenshot-comparison.js";

function showHelp() {
  console.log(`
Usage: npx rn-storybook-test screenshot-stories-ws [options]

Take screenshots of all Storybook stories using WebSocket communication and xcrun,
then compare them against baselines

Options:
  -c, --config-dir <path>        Path to Storybook config directory (default: ./.rnstorybook)
  -a, --app-id <id>              App bundle ID (default: host.exp.Exponent)
  -b, --baseline-dir <path>      Directory containing baseline screenshots (default: ./screenshots/baseline)
  -s, --screenshots-dir <path>   Directory for new screenshots (default: ./screenshots/current)
  -d, --diffs-dir <path>         Directory for diff images (default: ./screenshots/diffs)
  -t, --tolerance <number>       Tolerance for image comparison (default: 2.5)
  --strict                       Use strict image comparison
  --host <host>                  WebSocket host (default: localhost)
  --port <port>                  WebSocket port (default: 7007)
  --secured                      Use WSS instead of WS
  --wait-time <ms>               Wait time before starting tests (default: 2000)
  --deep-link <url>              Deep link URL to open after launching (useful for Expo Go)
  --skip-snapshot                Skip taking screenshots
  --skip-compare                 Skip comparing screenshots
  --update-baseline              Copy current screenshots to baseline directory
  --html-report                  Generate HTML comparison report (when comparing)
  --ignore-regions <regions>     Ignore custom regions (format: "x,y,w,h;x2,y2,w2,h2")
  -h, --help                     Show this help message

Examples:
  npx rn-storybook-test screenshot-stories-ws
  npx rn-storybook-test screenshot-stories-ws --app-id com.myapp --tolerance 5
  npx rn-storybook-test screenshot-stories-ws --deep-link "exp://127.0.0.1:8081"
  npx rn-storybook-test screenshot-stories-ws --skip-snapshot --skip-compare
  npx rn-storybook-test screenshot-stories-ws --update-baseline
  npx rn-storybook-test screenshot-stories-ws --html-report
  npx rn-storybook-test screenshot-stories-ws --ignore-regions "0,800,390,44"
`);
}

const run = async () => {
  const args = arg({
    // Types
    "--help": Boolean,
    "--config-dir": String,
    "--app-id": String,
    "--baseline-dir": String,
    "--screenshots-dir": String,
    "--diffs-dir": String,
    "--tolerance": Number,
    "--strict": Boolean,
    "--host": String,
    "--port": Number,
    "--secured": Boolean,
    "--wait-time": Number,
    "--deep-link": String,
    "--skip-snapshot": Boolean,
    "--skip-compare": Boolean,
    "--update-baseline": Boolean,
    "--html-report": Boolean,
    "--ignore-regions": String,

    // Aliases
    "-h": "--help",
    "-c": "--config-dir",
    "-a": "--app-id",
    "-b": "--baseline-dir",
    "-s": "--screenshots-dir",
    "-d": "--diffs-dir",
    "-t": "--tolerance",
  });

  if (args["--help"]) {
    showHelp();
    process.exit(0);
  }

  // Set defaults
  const configDir = args["--config-dir"] || "./.rnstorybook";
  const appId = args["--app-id"] || "host.exp.Exponent";
  const baselineDir = args["--baseline-dir"] || "./screenshots/baseline";
  const screenshotsDir = args["--screenshots-dir"] || "./screenshots/current";
  const diffsDir = args["--diffs-dir"] || "./screenshots/diffs";
  const tolerance = args["--tolerance"] || 2.5;
  const strict = args["--strict"] || false;
  const host = args["--host"] || "localhost";
  const port = args["--port"] || 7007;
  const secured = args["--secured"] || false;
  const waitTime = args["--wait-time"] || 2000;
  const deepLinkUrl = args["--deep-link"];
  const skipSnapshot = args["--skip-snapshot"] || false;
  const skipCompare = args["--skip-compare"] || false;
  const updateBaseline = args["--update-baseline"] || false;
  const htmlReport = args["--html-report"] || false;
  const ignoreRegionsStr = args["--ignore-regions"];

  try {
    // Step 1: Take screenshots via WebSocket
    if (!skipSnapshot) {
      console.log("\n📸 Taking screenshots via WebSocket...");

      const resolvedConfigDir = path.isAbsolute(configDir)
        ? configDir
        : path.join(process.cwd(), configDir);

      const resolvedScreenshotsDir = path.isAbsolute(screenshotsDir)
        ? screenshotsDir
        : path.join(process.cwd(), screenshotsDir);

      // Clear old screenshots before taking new ones
      clearDirectory(resolvedScreenshotsDir);
      mkdirSync(resolvedScreenshotsDir, { recursive: true });

      const index = await buildIndex({
        configDir: resolvedConfigDir,
      });

      const entries = Object.values(index.entries).filter(
        (entry: IndexEntry) =>
          entry.type === "story" && !entry.tags?.includes("skip-screenshot")
      );

      console.log(`Found ${entries.length} stories to screenshot`);

      try {
        await snapshotStorybookViaWebsocket({
          entries,
          appId,
          screenshotsDir: resolvedScreenshotsDir,
          host,
          port,
          secured,
          waitTime,
          ...(deepLinkUrl && { deepLinkUrl }),
        });
        console.log("✅ Screenshots completed successfully");
      } catch (error) {
        console.error("❌ Screenshot capture failed:", error);
        process.exit(1);
      }
    }

    // Step 2: Update baseline if requested (do this before comparison)
    if (updateBaseline) {
      console.log("\n📋 Updating baseline screenshots...");

      const resolvedScreenshotsDir = path.isAbsolute(screenshotsDir)
        ? screenshotsDir
        : path.join(process.cwd(), screenshotsDir);

      const resolvedBaselineDir = path.isAbsolute(baselineDir)
        ? baselineDir
        : path.join(process.cwd(), baselineDir);

      if (!existsSync(resolvedScreenshotsDir)) {
        console.error(
          `Screenshots directory not found: ${resolvedScreenshotsDir}`
        );
        console.error("Run without --skip-snapshot to generate screenshots first");
        process.exit(1);
      }

      try {
        await updateBaselineUtil(resolvedScreenshotsDir, resolvedBaselineDir);
        console.log("✅ Baseline screenshots updated successfully!");
      } catch (error) {
        console.error("❌ Failed to update baseline screenshots:", error);
        process.exit(1);
      }
    }

    // Step 3: Compare screenshots (skip if we just updated baseline)
    if (!skipCompare && !updateBaseline) {
      console.log("\n🔍 Comparing screenshots...");

      const resolvedScreenshotsDir = path.isAbsolute(screenshotsDir)
        ? screenshotsDir
        : path.join(process.cwd(), screenshotsDir);

      const resolvedBaselineDir = path.isAbsolute(baselineDir)
        ? baselineDir
        : path.join(process.cwd(), baselineDir);

      const resolvedDiffsDir = path.isAbsolute(diffsDir)
        ? diffsDir
        : path.join(process.cwd(), diffsDir);

      // Clear old diffs before comparing
      clearDirectory(resolvedDiffsDir);

      if (!existsSync(resolvedScreenshotsDir)) {
        console.error(
          `Screenshots directory not found: ${resolvedScreenshotsDir}`
        );
        console.error("Run without --skip-snapshot to generate screenshots first");
        process.exit(1);
      }

      if (!existsSync(resolvedBaselineDir)) {
        console.warn(`Baseline directory not found: ${resolvedBaselineDir}`);
        console.warn("No baseline screenshots to compare against");
        console.warn(
          "Consider copying current screenshots to baseline directory for future comparisons"
        );
        process.exit(0);
      }

      // Parse custom ignore regions if provided
      let ignoreRegions:
        | Array<{ x: number; y: number; width: number; height: number }>
        | undefined;

      if (ignoreRegionsStr) {
        ignoreRegions = parseIgnoreRegions(ignoreRegionsStr);
      }

      const results = await compareScreenshots({
        screenshotsDir: resolvedScreenshotsDir,
        baselineDir: resolvedBaselineDir,
        diffsDir: resolvedDiffsDir,
        tolerance,
        strict,
        ...(ignoreRegions && { ignoreRegions }),
      });

      console.log("\n📊 Comparison Results:");
      console.log(`  Total: ${results.total}`);
      console.log(`  Matches: ${results.matches}`);
      console.log(`  Differences: ${results.differences}`);
      console.log(`  Missing baselines: ${results.missingBaselines}`);

      // Generate HTML report if requested
      if (htmlReport) {
        const reportPath = await generateHtmlReport(results, {
          screenshotsDir: resolvedScreenshotsDir,
          baselineDir: resolvedBaselineDir,
          diffsDir: resolvedDiffsDir,
          tolerance,
          strict,
          ...(ignoreRegions && { ignoreRegions }),
        });
        console.log(`\n📄 HTML report generated: ${reportPath}`);
      }

      if (results.differences > 0) {
        console.log(
          `\n⚠️  ${results.differences} screenshots have differences`
        );
        console.log(`Diff images saved to: ${resolvedDiffsDir}`);
        if (htmlReport) {
          console.log("Open the HTML report to view detailed comparisons");
        }
        process.exit(1);
      }

      console.log("\n✅ All screenshots match!");
    }
  } catch (err: any) {
    console.error("Error:", err.message);
    process.exit(1);
  }
};

run();