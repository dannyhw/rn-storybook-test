import { writeFileSync, mkdirSync } from "fs";
import path from "path";
import type { StoryIndex } from "storybook/internal/types";

export interface MaestroGeneratorOptions {
  index: StoryIndex;
  outputDir: string;
  appId: string;
  baseUri: string;
  testName: string;
  screenshotsRelativePath?: string;
  host?: string;
  port?: number;
}

export async function generateMaestroTest(
  options: MaestroGeneratorOptions,
): Promise<boolean> {
  const {
    index,
    outputDir,
    appId,
    baseUri,
    testName,
    screenshotsRelativePath = "screenshots",
    host = "localhost",
    port = 7007,
  } = options;

  try {
    // Ensure output directory exists
    mkdirSync(outputDir, { recursive: true });

    // Generate Maestro test file content
    const stories = Object.values(index.entries)
      .filter(
        (entry) =>
          entry.type === "story" && !entry.tags?.includes("skip-screenshot"),
      )
      .map((story) => ({
        id: story.id,
        name: story.title.replace(/\//g, "-") + " - " + story.name,
      }));

    if (stories.length === 0) {
      console.warn(
        "No stories found. Make sure your Storybook config directory is correct.",
      );
      return false;
    }

    console.log(`Found ${stories.length} stories`);

    const selectStorySyncScriptName = `${testName}.select-story-sync.js`;
    const scriptPath = path.join(outputDir, selectStorySyncScriptName);

    const selectStorySyncScript = `const storyId = STORY_ID;
const endpoint = \`http://${host}:${port}/select-story-sync/\${storyId}\`;
const response = http.request(endpoint, {
  method: 'POST',
  body: '',
});

if (!(response.status >= 200 && response.status < 300)) {
  throw new Error(\`Failed to select story "\${storyId}" (status \${response.status})\`);
}
`;

    writeFileSync(scriptPath, selectStorySyncScript);
    console.log(`✅ Generated Maestro script: ${scriptPath}`);

    const assertFlow = stories
      .map((story) => {
        const screenshotName = story.name.replace(/ /g, "-");
        const screenshotPath = `${screenshotsRelativePath}/${screenshotName}.png`;

        return `# Story ${story.name}
- runScript:
    file: '${selectStorySyncScriptName}'
    env:
      STORY_ID: '${story.id}'
- waitForAnimationToEnd
- assertVisible:
    id: '${story.id}'
- assertScreenshot: '${screenshotPath}'
`;
      })
      .join("\n");

    const captureFlow = stories
      .map((story) => {
        const screenshotName = story.name.replace(/ /g, "-");
        const screenshotPath = `${screenshotsRelativePath}/${screenshotName}`;

        return `# Story ${story.name}
- runScript:
    file: '${selectStorySyncScriptName}'
    env:
      STORY_ID: '${story.id}'
- waitForAnimationToEnd
- assertVisible:
    id: '${story.id}'
- takeScreenshot: '${screenshotPath}'
`;
      })
      .join("\n");

    const preamble = `- openLink: '${baseUri}'
- waitForAnimationToEnd
`;

    const assertContent = `appId: ${appId}
name: Take screenshots of all Storybook stories
---
- stopApp: ${appId}
${preamble}
${assertFlow}`;

    const captureContent = `appId: ${appId}
name: Capture baseline screenshots of all Storybook stories
---
- stopApp: ${appId}
${preamble}
${captureFlow}`;

    // Write the assert and capture Maestro flow files
    const maestroTestPath = path.join(outputDir, `${testName}.yaml`);
    const maestroCapturePath = path.join(outputDir, `${testName}.capture.yaml`);

    writeFileSync(maestroTestPath, assertContent);
    writeFileSync(maestroCapturePath, captureContent);

    console.log(`✅ Generated Maestro test file: ${maestroTestPath}`);
    console.log(`✅ Generated Maestro capture flow: ${maestroCapturePath}`);
    return true;
  } catch (error) {
    console.error("Error generating Maestro test file:", error);
    return false;
  }
}
