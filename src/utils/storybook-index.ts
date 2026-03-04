import type { StoryIndex } from "storybook/internal/types";

type BuildIndexFn = (configDir: string) => Promise<StoryIndex>;

let cachedBuildIndexFn: BuildIndexFn | null = null;

async function resolveBuildIndexFn(): Promise<BuildIndexFn> {
  const moduleName = "@storybook/react-native/node";

  try {
    const mod = (await import(moduleName)) as {
      buildIndex?: (options: { configPath: string }) => Promise<StoryIndex>;
    };

    if (typeof mod.buildIndex === "function") {
      return (configDir: string) => mod.buildIndex!({ configPath: configDir });
    }
  } catch {
    // no-op
  }

  throw new Error(
    "Could not find Storybook v10 React Native buildIndex. Install @storybook/react-native v10+.",
  );
}

export async function buildStorybookIndex(
  configDir: string,
): Promise<StoryIndex> {
  if (!cachedBuildIndexFn) {
    cachedBuildIndexFn = await resolveBuildIndexFn();
  }

  return cachedBuildIndexFn(configDir);
}
