# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a React Native Storybook testing utility library that provides automated screenshot testing capabilities. The package includes CLI tools for generating Maestro test files, taking screenshots of Storybook stories (via Maestro or WebSocket), and comparing them against baselines.

## Tech Stack

- **Language**: TypeScript (CommonJS output)
- **Build Tool**: tsup (TypeScript bundler)
- **Package Manager**: Bun (with npm/yarn compatibility)
- **Target**: Node.js >=18.0.0
- **Peer Dependencies**: React Native (>=0.57.0), React, Storybook (^9.0.12)

## Commands

### Development

```bash
# Watch mode for development
bun run dev
```

### Build

```bash
# Build the project
bun run build
```

## Architecture

The project is organized as a CLI tool library with five main entry points:

1. **gen-maestro** (`src/gen-maestro.ts`): Generates Maestro test files from Storybook stories
2. **screenshot-stories** (`src/screenshot-stories.ts`): Takes screenshots using Maestro and compares against baselines
3. **screenshot-stories-ws** (`src/screenshot-stories-ws.ts`): Takes screenshots using WebSocket + xcrun (iOS Simulator) and compares against baselines
4. **compare-screenshots** (`src/compare-screenshots.ts`): Standalone screenshot comparison tool
5. **detect-ignore-regions** (`src/detect-ignore-regions.ts`): Interactive tool for identifying regions to ignore in comparisons

### Key Utilities

- `utils/maestro-generator.ts`: Core logic for generating Maestro test files
- `utils/screenshot-comparison.ts`: Image comparison functionality using odiff-bin
- `utils/websocket-snapshot.ts`: WebSocket-based screenshot taking using xcrun simctl (iOS Simulator only)

### Build Output

All compiled JavaScript files are output to the `dist/` directory as CommonJS modules. The CLI tools are exposed as bin commands through package.json.

### Story Processing Flow

1. **Index Building**: Uses `buildIndex` from `storybook/internal/core-server` to read story metadata from the Storybook config directory
2. **Story Filtering**: Filters out stories tagged with `skip-screenshot` and only processes stories of type `"story"`
3. **Maestro Generation**: Converts story entries into Maestro YAML test steps with deep links using the format: `${baseUri}?STORYBOOK_STORY_ID=${story.id}`
4. **Screenshot Naming**: Story names are normalized by replacing `/` with `-` and spaces with `-` for filesystem compatibility

### Screenshot Approaches

There are two approaches for taking screenshots:

1. **Maestro-based** (`screenshot-stories`): Uses Maestro to open deep links and take screenshots. Works on both iOS and Android, but requires Maestro to be installed.

2. **WebSocket-based** (`screenshot-stories-ws`): Uses WebSocket communication to navigate Storybook stories and takes screenshots using `xcrun simctl io booted screenshot`. Only works with iOS Simulator, but doesn't require Maestro. Automatically overrides the iOS Simulator status bar with consistent values (time: 06:06, battery: 100%, wifi: 3 bars, cellular: 4 bars) to prevent false positives from changing battery levels, time, etc.

### Screenshot Comparison System

The comparison system uses odiff-bin for fast, native image diffing:

- **Tolerance**: Specified as percentage (default 2.5%), converted to 0-1 range for odiff
- **Antialiasing**: Enabled by default (disabled in strict mode)
- **Ignore Regions**: Custom rectangular regions can be specified in `x,y,width,height` format and are automatically converted to `x1,y1,x2,y2` format for odiff's native region ignoring

## Testing Approach

This project doesn't have a traditional test suite as it's a testing utility itself. When developing:

1. Build the project: `bun run build`
2. Test the CLI commands locally using `npx` or by linking the package
3. Verify generated Maestro files and screenshot comparisons work correctly

## Key Dependencies

- **arg**: CLI argument parsing
- **odiff-bin**: Image diffing tool for visual comparisons
- **pngjs**: PNG image processing
- **storybook**: Core Storybook functionality including internal/core-server for building Storybook index
- **ws**: WebSocket client for WebSocket-based screenshot approach