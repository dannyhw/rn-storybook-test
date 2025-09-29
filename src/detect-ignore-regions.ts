#!/usr/bin/env node
import path from 'path';
import arg from 'arg';
import { existsSync, readdirSync } from 'fs';
import { createInterface } from 'readline';

function showHelp() {
  console.log(`
Usage: npx rn-storybook-test detect-ignore-regions [options]

Interactively select a diff image to extract ignore regions from

Options:
  -d, --diffs-dir <path>         Directory containing diff images (default: ./screenshots/diffs or ./.maestro/diffs)
  -s, --screenshots-dir <path>   Directory containing screenshots (default: ./screenshots/current or ./.maestro/screenshots)
  -h, --help                     Show this help message

Examples:
  npx rn-storybook-test detect-ignore-regions
  npx rn-storybook-test detect-ignore-regions --diffs-dir ./my-diffs
  npx rn-storybook-test detect-ignore-regions -d ./screenshots/diffs -s ./screenshots/current

This command shows you a list of available diff images and lets you select one
to analyze. It will then extract the diff regions and provide you with the exact
coordinates to use in the --ignore-regions flag.
`);
}

interface DiffRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

function askUserChoice(question: string, choices: string[]): Promise<number> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log(question);
    choices.forEach((choice, index) => {
      console.log(`  ${index + 1}. ${choice}`);
    });
    console.log();

    rl.question('Enter your choice (number): ', (answer) => {
      rl.close();
      const choice = parseInt(answer.trim()) - 1;
      if (choice >= 0 && choice < choices.length) {
        resolve(choice);
      } else {
        console.log('Invalid choice. Exiting.');
        process.exit(1);
      }
    });
  });
}

async function generatePreviewImage(
  originalImagePath: string,
  regions: DiffRegion[],
  outputPath: string
): Promise<void> {
  try {
    const fs = require('fs');
    const { PNG } = require('pngjs');

    // Read the original image
    const data = fs.readFileSync(originalImagePath);
    const png = PNG.sync.read(data);

    // Create a copy of the image data
    const previewPng = new PNG({ width: png.width, height: png.height });
    png.data.copy(previewPng.data);

    // Draw red rectangles for each ignore region
    regions.forEach((region) => {
      // Draw top and bottom borders
      for (let x = region.x; x < region.x + region.width && x < png.width; x++) {
        // Top border
        if (region.y >= 0 && region.y < png.height) {
          for (let i = 0; i < 2; i++) {
            // 2px thick border
            const y = region.y + i;
            if (y < png.height) {
              const idx = (png.width * y + x) << 2;
              previewPng.data[idx] = 255; // R
              previewPng.data[idx + 1] = 0; // G
              previewPng.data[idx + 2] = 0; // B
              previewPng.data[idx + 3] = 255; // A
            }
          }
        }

        // Bottom border
        const bottomY = region.y + region.height - 1;
        if (bottomY >= 0 && bottomY < png.height) {
          for (let i = 0; i < 2; i++) {
            // 2px thick border
            const y = bottomY - i;
            if (y >= 0 && y < png.height) {
              const idx = (png.width * y + x) << 2;
              previewPng.data[idx] = 255; // R
              previewPng.data[idx + 1] = 0; // G
              previewPng.data[idx + 2] = 0; // B
              previewPng.data[idx + 3] = 255; // A
            }
          }
        }
      }

      // Draw left and right borders
      for (let y = region.y; y < region.y + region.height && y < png.height; y++) {
        // Left border
        if (region.x >= 0 && region.x < png.width) {
          for (let i = 0; i < 2; i++) {
            // 2px thick border
            const x = region.x + i;
            if (x < png.width) {
              const idx = (png.width * y + x) << 2;
              previewPng.data[idx] = 255; // R
              previewPng.data[idx + 1] = 0; // G
              previewPng.data[idx + 2] = 0; // B
              previewPng.data[idx + 3] = 255; // A
            }
          }
        }

        // Right border
        const rightX = region.x + region.width - 1;
        if (rightX >= 0 && rightX < png.width) {
          for (let i = 0; i < 2; i++) {
            // 2px thick border
            const x = rightX - i;
            if (x >= 0 && x < png.width) {
              const idx = (png.width * y + x) << 2;
              previewPng.data[idx] = 255; // R
              previewPng.data[idx + 1] = 0; // G
              previewPng.data[idx + 2] = 0; // B
              previewPng.data[idx + 3] = 255; // A
            }
          }
        }
      }
    });

    // Save the preview image
    const buffer = PNG.sync.write(previewPng);
    fs.writeFileSync(outputPath, buffer);
  } catch (error) {
    console.warn(`⚠️  Could not generate preview image:`, error);
  }
}

async function analyzeDiffImage(
  diffPath: string,
  screenshotsDir: string
): Promise<{ regions: DiffRegion[]; previewPath?: string }> {
  try {
    console.log(`\n📊 Analyzing diff image: ${path.basename(diffPath)}`);

    // Load the image and analyze diff pixels
    const fs = require('fs');
    const { PNG } = require('pngjs');

    const data = fs.readFileSync(diffPath);

    // Validate it's a PNG file
    if (data.length < 8 || data[0] !== 0x89 || data[1] !== 0x50 || data[2] !== 0x4E || data[3] !== 0x47) {
      throw new Error('File is not a valid PNG image');
    }

    let png: any;
    try {
      png = PNG.sync.read(data);
    } catch (parseError: any) {
      console.warn(`⚠️  PNG parsing failed: ${parseError.message}`);
      console.log('💡 Trying alternative parsing method...');

      // Try parsing with error tolerance
      const tempPng = new PNG({ filterType: -1 });
      await new Promise((resolve, reject) => {
        tempPng.parse(data, (error: any, parsedData: any) => {
          if (error) reject(error);
          else {
            png = parsedData;
            resolve(parsedData);
          }
        });
      });
    }

    console.log(`📐 Image dimensions: ${png.width}x${png.height}`);

    // Find diff pixels (assuming magenta/pink diff color)
    const diffPixels: Array<{ x: number; y: number }> = [];

    for (let y = 0; y < png.height; y++) {
      for (let x = 0; x < png.width; x++) {
        const idx = (png.width * y + x) << 2;
        const r = png.data[idx];
        const g = png.data[idx + 1];
        const b = png.data[idx + 2];
        const a = png.data[idx + 3];

        // Detect #F0F (magenta) diff pixels with tolerance for compression/anti-aliasing
        // #F0F = r=255, g=0, b=255
        if (
          a > 0 &&
          ((r > 240 && g < 50 && b > 240) || // Close to #F0F (255,0,255)
            (r > 200 && g < 100 && b > 150) || // Broader magenta-ish (fallback)
            (r > 200 && g < 150 && b > 200)) // Pink-ish (fallback)
        ) {
          diffPixels.push({ x, y });
        }
      }
    }

    console.log(`🎯 Found ${diffPixels.length} diff pixels`);

    if (diffPixels.length === 0) {
      console.log('⚠️  No obvious diff pixels found. This might not be a typical diff image.');
      return { regions: [] };
    }

    // Find bounding rectangles for clusters of diff pixels
    const regions = findBoundingRectangles(diffPixels, png.width, png.height);

    console.log(`📦 Found ${regions.length} potential ignore regions:`);
    regions.forEach((region, index) => {
      console.log(
        `   Region ${index + 1}: x=${region.x}, y=${region.y}, w=${region.width}, h=${region.height} (area: ${region.width * region.height}px)`
      );
    });

    // Generate preview image if we found regions
    if (regions.length > 0) {
      // Find the corresponding original image
      const diffFileName = path.basename(diffPath);
      const originalFileName = diffFileName.replace('diff_', '');
      const originalPath = path.join(screenshotsDir, originalFileName);

      if (existsSync(originalPath)) {
        const previewPath = diffPath.replace('diff_', 'preview_ignore_regions_');
        console.log(`\n🖼️  Generating preview image with ignore regions highlighted...`);

        await generatePreviewImage(originalPath, regions, previewPath);
        console.log(`✅ Preview saved: ${previewPath}`);

        return { regions, previewPath };
      } else {
        console.log(`⚠️  Original image not found at: ${originalPath}`);
        console.log(`   Preview image cannot be generated`);
      }
    }

    return { regions };
  } catch (error) {
    console.warn(`⚠️  Could not analyze ${diffPath}:`, error);
    console.log('💡 Make sure this is a PNG diff image generated by the comparison tool');
    return { regions: [] };
  }
}

function findBoundingRectangles(
  pixels: Array<{ x: number; y: number }>,
  imageWidth: number,
  imageHeight: number
): DiffRegion[] {
  if (pixels.length === 0) return [];

  // Simple approach: find overall bounding box and common rectangular regions
  const allX = pixels.map((p) => p.x);
  const allY = pixels.map((p) => p.y);

  const minX = Math.min(...allX);
  const maxX = Math.max(...allX);
  const minY = Math.min(...allY);
  const maxY = Math.max(...allY);

  const regions: DiffRegion[] = [];

  // Add overall bounding rectangle
  regions.push({
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  });

  // Look for horizontal bands (like status bars or home indicators)
  const yGroups = new Map<number, number>();
  pixels.forEach((p) => {
    const yBand = Math.floor(p.y / 10) * 10; // Group by 10px bands
    yGroups.set(yBand, (yGroups.get(yBand) || 0) + 1);
  });

  // Find significant horizontal bands
  for (const [yBand, count] of yGroups.entries()) {
    if (count > pixels.length * 0.1) {
      // If this band has >10% of diff pixels
      const bandPixels = pixels.filter((p) => Math.abs(p.y - yBand) < 15);
      if (bandPixels.length > 50) {
        // Minimum threshold
        const bandMinX = Math.min(...bandPixels.map((p) => p.x));
        const bandMaxX = Math.max(...bandPixels.map((p) => p.x));
        const bandMinY = Math.min(...bandPixels.map((p) => p.y));
        const bandMaxY = Math.max(...bandPixels.map((p) => p.y));

        regions.push({
          x: Math.max(0, bandMinX - 5),
          y: Math.max(0, bandMinY - 5),
          width: Math.min(imageWidth, bandMaxX - bandMinX + 11),
          height: Math.min(imageHeight, bandMaxY - bandMinY + 11),
        });
      }
    }
  }

  // Remove duplicates and very small regions
  const uniqueRegions = regions
    .filter((r) => r.width * r.height > 100) // Minimum 100px area
    .filter((region, index, arr) => {
      // Remove regions that are completely contained within others
      return !arr.some(
        (other, otherIndex) =>
          otherIndex !== index &&
          other.x <= region.x &&
          other.y <= region.y &&
          other.x + other.width >= region.x + region.width &&
          other.y + other.height >= region.y + region.height
      );
    });

  return uniqueRegions.slice(0, 5); // Max 5 regions
}

const run = async () => {
  const args = arg({
    // Types
    '--help': Boolean,
    '--diffs-dir': String,
    '--screenshots-dir': String,

    // Aliases
    '-h': '--help',
    '-d': '--diffs-dir',
    '-s': '--screenshots-dir',
  });

  if (args['--help']) {
    showHelp();
    process.exit(0);
  }

  // Set defaults - try WebSocket paths first, fallback to Maestro paths
  const wsDefaultExists = existsSync('./screenshots/diffs');
  const defaultBaseDir = wsDefaultExists ? './screenshots' : './.maestro';

  const diffsDir = args['--diffs-dir'] || path.join(defaultBaseDir, 'diffs');
  const screenshotsDir = args['--screenshots-dir'] || path.join(defaultBaseDir, defaultBaseDir === './screenshots' ? 'current' : 'screenshots');

  try {
    const resolvedDiffsDir = path.isAbsolute(diffsDir)
      ? diffsDir
      : path.join(process.cwd(), diffsDir);

    const resolvedScreenshotsDir = path.isAbsolute(screenshotsDir)
      ? screenshotsDir
      : path.join(process.cwd(), screenshotsDir);

    if (!existsSync(resolvedDiffsDir)) {
      console.error(`❌ Diffs directory not found: ${resolvedDiffsDir}`);
      console.error('💡 Run screenshot comparison first to generate diff images');
      process.exit(1);
    }

    console.log('🔍 Looking for diff images to analyze...\n');

    const diffFiles = readdirSync(resolvedDiffsDir).filter(
      (file) => file.startsWith('diff_') && file.endsWith('.png')
    );

    if (diffFiles.length === 0) {
      console.warn('⚠️  No diff images found in the diffs directory');
      console.log(
        '💡 Run screenshot comparison without ignore regions to generate diff images first'
      );
      process.exit(0);
    }

    console.log(`📁 Found ${diffFiles.length} diff images:`);
    console.log();

    // Show list of diff files and let user choose
    const selectedIndex = await askUserChoice(
      '🎯 Which diff image would you like to analyze for ignore regions?',
      diffFiles.map((file) => file.replace('diff_', '').replace('.png', ''))
    );

    const selectedFile = diffFiles[selectedIndex];
    const diffPath = path.join(resolvedDiffsDir, selectedFile);

    console.log(`\n✅ Selected: ${selectedFile}`);

    const { regions, previewPath } = await analyzeDiffImage(diffPath, resolvedScreenshotsDir);

    if (regions.length === 0) {
      console.log('\n⚠️  No suitable ignore regions found in this diff image.');
      console.log('This could mean:');
      console.log(
        '- The differences are very scattered (not suitable for rectangular ignore regions)'
      );
      console.log('- The diff colors are different than expected');
      console.log('- The differences are legitimate content changes');
      process.exit(0);
    }

    console.log('\n🎯 Suggested ignore regions:');
    console.log();

    regions.forEach((region, index) => {
      console.log(
        `Region ${index + 1}: x=${region.x}, y=${region.y}, w=${region.width}, h=${region.height} (${region.width * region.height}px)`
      );
    });

    // Show preview image link if available
    if (previewPath) {
      console.log('\n👀 Preview image with ignore regions highlighted in red:');
      console.log(`   file://${previewPath}`);
      console.log(
        '\n💡 Open this link in your browser to see the ignore regions on the original image'
      );
    }

    // Generate the command line argument
    const regionsStr = regions
      .map((region) => `${region.x},${region.y},${region.width},${region.height}`)
      .join(';');

    console.log('\n📋 To use these ignore regions, run your comparison command with:');
    console.log();
    console.log(`--ignore-regions "${regionsStr}"`);
    console.log();
    console.log('Full example commands:');
    console.log(
      `npx rn-storybook-test screenshot-stories --ignore-regions "${regionsStr}"`
    );
    console.log(
      `npx rn-storybook-test screenshot-stories-ws --ignore-regions "${regionsStr}"`
    );
    console.log(
      `npx rn-storybook-test compare-screenshots --ignore-regions "${regionsStr}"`
    );

    console.log('\n💡 Tip: You can also manually adjust the coordinates if needed!');
  } catch (err: any) {
    console.error('Error:', err.message);
    process.exit(1);
  }
};

run();
