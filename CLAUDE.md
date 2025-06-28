This file provides guidance to agents when working with code in this repository.

## Project Overview

This is a React Native Storybook testing utility library that provides automated screenshot testing capabilities using Maestro. The package includes CLI tools for generating Maestro test files, taking screenshots of Storybook stories, and comparing them against baselines.

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

The project is organized as a CLI tool library with four main entry points:

1. **gen-maestro** (`src/gen-maestro.ts`): Generates Maestro test files from Storybook stories
2. **screenshot-stories** (`src/screenshot-stories.ts`): Takes screenshots and compares against baselines
3. **compare-screenshots** (`src/compare-screenshots.ts`): Standalone screenshot comparison tool
4. **detect-ignore-regions** (`src/detect-ignore-regions.ts`): Interactive tool for identifying regions to ignore in comparisons

### Key Utilities

- `utils/maestro-generator.ts`: Core logic for generating Maestro test files
- `utils/screenshot-comparison.ts`: Image comparison functionality

### Build Output

All compiled JavaScript files are output to the `dist/` directory as CommonJS modules. The CLI tools are exposed as bin commands through package.json.

## Testing Approach

This project doesn't have a traditional test suite as it's a testing utility itself. When developing:

1. Build the project: `npm run build`
2. Test the CLI commands locally using `npx` or by linking the package
3. Verify generated Maestro files and screenshot comparisons work correctly

## Key Dependencies

- **arg**: CLI argument parsing
- **odiff-bin**: Image diffing tool for visual comparisons
- **pngjs**: PNG image processing
- **storybook**: Core Storybook functionality including internal/core-server for building Storybook index
