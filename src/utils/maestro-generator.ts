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
  selectStorySync?: boolean;
  host?: string;
  port?: number;
  secured?: boolean;
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
    selectStorySync = false,
    host = "localhost",
    port = 7007,
    secured = false,
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

    if (selectStorySync) {
      const selectStorySyncScript = `const storyId = STORY_ID;
const host = STORYBOOK_HOST;
const port = STORYBOOK_PORT;
const secured = STORYBOOK_SECURED === 'true';
const protocol = secured ? 'https' : 'http';
const endpoint = \`\${protocol}://\${host}:\${port}/select-story-sync/\${encodeURIComponent(storyId)}\`;
const response = http.get(endpoint);

if (!(response.status >= 200 && response.status < 300)) {
  throw new Error(\`Failed to select story "\${storyId}" (status \${response.status})\`);
}
`;

      writeFileSync(scriptPath, selectStorySyncScript);
      console.log(`✅ Generated Maestro script: ${scriptPath}`);
    }

    const storiesFlow = stories
      .map((story) => {
        const screenshotName = story.name.replace(/ /g, "-");
        const screenshotPath = `${screenshotsRelativePath}/${screenshotName}.png`;

        if (!selectStorySync) {
          return `# Story ${story.name}
- openLink: '${baseUri}?STORYBOOK_STORY_ID=${story.id}'
- waitForAnimationToEnd
- assertVisible:
    id: '${story.id}'
- assertScreenshot: '${screenshotPath}'
`;
        }

        return `# Story ${story.name}
- runScript:
    file: '${selectStorySyncScriptName}'
    env:
      STORY_ID: '${story.id}'
      STORYBOOK_HOST: '${host}'
      STORYBOOK_PORT: '${port}'
      STORYBOOK_SECURED: '${secured}'
- waitForAnimationToEnd
- assertVisible:
    id: '${story.id}'
- assertScreenshot: '${screenshotPath}'
`;
      })
      .join("\n");

    const preamble = selectStorySync
      ? `- openLink: '${baseUri}'
- waitForAnimationToEnd
`
      : "";

    const maestroContent = `appId: ${appId}
name: Take screenshots of all Storybook stories
---
- stopApp: ${appId}
${preamble}
${storiesFlow}`;

    // Write the Maestro test file
    const maestroTestPath = path.join(outputDir, `${testName}.yaml`);
    writeFileSync(maestroTestPath, maestroContent);

    console.log(`✅ Generated Maestro test file: ${maestroTestPath}`);
    return true;
  } catch (error) {
    console.error("Error generating Maestro test file:", error);
    return false;
  }
}
