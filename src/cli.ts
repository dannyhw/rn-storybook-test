#!/usr/bin/env node

const args = process.argv.slice(2);
const command = args[0];

// Static mapping of commands to their imports
const commandMap: Record<string, () => Promise<any>> = {
  "gen-maestro": () => import("./gen-maestro.js"),
  "screenshot-stories": () => import("./screenshot-stories.js"),
  "screenshot-stories-ws": () => import("./screenshot-stories-ws.js"),
  "compare-screenshots": () => import("./compare-screenshots.js"),
  "detect-ignore-regions": () => import("./detect-ignore-regions.js"),
};

const commands = Object.keys(commandMap);

function showHelp() {
  console.log(`
Usage: npx rn-storybook-test <command> [options]

Commands:
  gen-maestro              Generate Maestro test files for Storybook stories
  screenshot-stories       Take screenshots using Maestro and compare against baselines
  screenshot-stories-ws    Take screenshots using WebSocket (iOS Simulator only) and compare
  compare-screenshots      Compare screenshots against baseline images
  detect-ignore-regions    Interactively extract ignore regions from diff images

Options:
  -h, --help              Show help for a command

Examples:
  npx rn-storybook-test screenshot-stories-ws --update-baseline
  npx rn-storybook-test compare-screenshots --html-report
  npx rn-storybook-test gen-maestro --help

For more information, visit: https://github.com/dannyhw/rn-storybook-test
`);
}

if (!command || command === "-h" || command === "--help") {
  showHelp();
  process.exit(0);
}

if (!commands.includes(command)) {
  console.error(`Error: Unknown command "${command}"\n`);
  showHelp();
  process.exit(1);
}

// Remove the command from argv so the subcommand sees only its own args
process.argv.splice(2, 1);

// Import and run the command script
async function runCommand() {
  try {
    await commandMap[command]();
  } catch (error: any) {
    console.error(`Error running command "${command}":`, error.message);
    process.exit(1);
  }
}

runCommand();