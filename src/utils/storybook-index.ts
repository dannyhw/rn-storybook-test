import type { StoryIndex } from "storybook/internal/types";

type BuildIndexFn = (configDir: string) => Promise<StoryIndex>;

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
  const buildIndexFn = await resolveBuildIndexFn();
  return buildIndexFn(configDir);
}
