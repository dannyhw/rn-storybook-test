import "websocket-polyfill";
import { Channel, WebsocketTransport } from "storybook/internal/channels";
import Events from "storybook/internal/core-events";
import { execSync, type ExecSyncOptions } from "child_process";
import { WebSocketServer } from "ws";
import type { IndexEntry } from "storybook/internal/types";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const exec = (
  command: string,
  options: ExecSyncOptions = {},
  {
    errorMessage,
    ignoreError,
  }: { errorMessage?: string; ignoreError?: boolean } = {}
) => {
  try {
    return execSync(command, options);
  } catch (error) {
    if (errorMessage) {
      console.error(errorMessage);
    } else {
      console.error("Error executing command", command, error);
    }

    if (ignoreError) {
      return "" as ReturnType<typeof execSync>;
    } else {
      throw error;
    }
  }
};

interface SimulatorDevice {
  udid: string;
  name: string;
  state: "Shutdown" | "Booted" | "Shutting Down" | "Booting";
  isAvailable: boolean;
  deviceTypeIdentifier: string;
}

interface SimulatorData {
  devices: Record<string, SimulatorDevice[]>;
}

export const bootBestSimulator = (): string => {
  const { devices }: SimulatorData = JSON.parse(
    exec("xcrun simctl list devices --json", { encoding: "utf8" }) as string
  );

  const availableDevices = Object.values(devices)
    .flat()
    .filter((d) => d.name.includes("iPhone") && d.isAvailable)
    .sort((a, b) => {
      // Prefer booted devices
      const bootedDiff =
        (b.state === "Booted" ? 1 : 0) - (a.state === "Booted" ? 1 : 0);
      if (bootedDiff !== 0) return bootedDiff;

      // Prefer devices that match "iPhone [number]" pattern
      const aIsStandard = /^iPhone \d+$/.test(a.name);
      const bIsStandard = /^iPhone \d+$/.test(b.name);

      if (!aIsStandard && bIsStandard) return 1;
      if (aIsStandard && !bIsStandard) return -1;

      // Fall back to name comparison
      return b.name.localeCompare(a.name);
    });

  const device = availableDevices[0];
  if (!device) throw new Error("No iPhone simulator found");

  if (device.state === "Booted") {
    return device.udid;
  }

  exec(`xcrun simctl boot ${device.udid}`, { stdio: "inherit" });
  return device.udid;
};

/**
 * Override the iOS Simulator status bar with consistent values to prevent
 * false positives from changing battery levels, time, signal strength, etc.
 */
export const overrideStatusBar = () => {
  console.log("🔧 Setting consistent status bar state...");
  const command = `xcrun simctl status_bar booted override --time "06:06" --operatorName "" --wifiBars 3 --cellularBars 4 --batteryLevel 100`;
  console.log(`Running command: ${command}`);

  try {
    exec(command, { stdio: "inherit" });
    console.log("✅ Status bar override succeeded");
  } catch (error) {
    console.error("❌ Status bar override failed:", error);
    throw error;
  }
};

export interface WebsocketSnapshotOptions {
  entries: IndexEntry[];
  appId: string;
  screenshotsDir: string;
  host?: string;
  port?: number;
  secured?: boolean;
  waitTime?: number;
  deepLinkUrl?: string;
}

export async function snapshotStorybookViaWebsocket(
  options: WebsocketSnapshotOptions
): Promise<void> {
  const {
    entries,
    appId,
    screenshotsDir,
    host = "localhost",
    port = 7007,
    secured = false,
    waitTime = 4000,
    deepLinkUrl,
  } = options;

  const domain = `${host}:${port}`;
  const wss = new WebSocketServer({ port, host, autoPong: true });

  let pingInterval: NodeJS.Timeout | null = null;

  const closeAll = (returnCode: number = 0) => {
    if (pingInterval) {
      clearInterval(pingInterval);
    }
    wss.close();
    wss.clients.forEach((ws) => ws.close());
    if (returnCode !== 0) {
      throw new Error(`WebSocket snapshot failed with code ${returnCode}`);
    }
  };

  try {
    wss.on("connection", function connection(ws) {
      console.log("websocket connection established");

      ws.on("error", (error) => {
        console.error("websocket error", error);
      });

      ws.on("message", function message(data) {
        try {
          const json = JSON.parse(data.toString());
          wss.clients.forEach((wsClient) =>
            wsClient.send(JSON.stringify(json))
          );
        } catch (error) {
          console.log("error parsing message", data.toString());
          console.error(error);
        }
      });
    });

    const websocketType = secured ? "wss" : "ws";
    const url = `${websocketType}://${domain}`;

    // Wait for WebSocket server to be ready
    await new Promise<void>((resolve) => {
      wss.once("listening", () => {
        console.log("WebSocket server is ready");
        resolve();
      });

      // If server is already listening, resolve immediately
      if (wss.address()) {
        console.log("WebSocket server is already ready");
        resolve();
      }
    });

    const channel = new Channel({
      transport: new WebsocketTransport({
        url,
        page: "manager",
        onError: (error) => console.error("channel error", error),
      }),
    });

    // Start ping interval to keep WebSocket connection alive
    pingInterval = setInterval(() => {
      wss.clients.forEach((ws) => {
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ type: "ping", args: [] }));
        }
      });
    }, 5000);

    // make sure simulator is booted
    const udid = bootBestSimulator();
    console.log(`Using simulator: ${udid}`);

    exec("xcrun simctl bootstatus booted");

    // Override status bar with consistent values
    overrideStatusBar();

    // will throw if app is not installed
    exec(`xcrun simctl get_app_container booted ${appId}`, undefined, {
      errorMessage: `App ${appId} is not installed on device.`,
    });

    // kill the app if it's running
    exec(`xcrun simctl terminate booted ${appId} || true`, undefined, {
      ignoreError: true,
    });

    // If deep link URL is provided, open it after launching (useful for Expo Go)
    if (deepLinkUrl) {
      console.log(`Opening deep link: ${deepLinkUrl}`);
      exec(`xcrun simctl openurl booted "${deepLinkUrl}"`);
      await sleep(1000);
    } else {
      // launch the app
      exec(`xcrun simctl launch booted ${appId}`);
    }

    console.log("Starting storybook testing");

    async function setStoryWithRetry(
      entry: IndexEntry,
      maxRetries: number = 3
    ): Promise<void> {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          channel.emit(Events.SET_CURRENT_STORY, { storyId: entry.id });

          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              channel.removeListener(Events.CURRENT_STORY_WAS_SET, onStorySet);
              channel.removeListener(Events.STORY_RENDERED, onStoryRendered);
              reject(
                new Error(
                  `story not set/rendered after 5000ms (attempt ${attempt}/${maxRetries})`
                )
              );
            }, 5000);

            const cleanupAndResolve = () => {
              clearTimeout(timeout);
              channel.removeListener(Events.CURRENT_STORY_WAS_SET, onStorySet);
              channel.removeListener(Events.STORY_RENDERED, onStoryRendered);
              resolve(0);
            };

            const onStorySet = ({ storyId }: { storyId: string }) => {
              if (entry.id === storyId) {
                console.log(`story was set: ${storyId}`);
                cleanupAndResolve();
              }
            };

            const onStoryRendered = ({ storyId }: { storyId: string }) => {
              if (entry.id === storyId) {
                console.log(`story was rendered: ${storyId}`);
                cleanupAndResolve();
              }
            };

            channel.on(Events.CURRENT_STORY_WAS_SET, onStorySet);
            channel.on(Events.STORY_RENDERED, onStoryRendered);
          });

          // Success - break out of retry loop
          return;
        } catch (error) {
          console.log(
            `⚠️  Attempt ${attempt}/${maxRetries} failed for ${entry.title} - ${entry.name}`
          );

          if (attempt === maxRetries) {
            console.error(
              `❌ Failed to set story after ${maxRetries} attempts: ${entry.title} - ${entry.name}`
            );
            throw error;
          }

          // Wait a bit before retrying
          console.log(`Retrying in 1 second...`);
          await sleep(500);
        }
      }
    }

    async function snapshotAllStories() {
      for (const entry of entries) {
        console.log("story", entry.title, entry.name);

        await setStoryWithRetry(entry);

        const screenshotPath = `${screenshotsDir}/${entry.id}.png`;
        exec(
          `xcrun simctl io booted screenshot --type png "${screenshotPath}"`
        );

        // Small delay between screenshots to let things settle
        await sleep(100);
      }
    }

    // wait for storybook to start or for story to be rendered
    await Promise.race([
      sleep(waitTime),
      new Promise((resolve) => {
        channel.once(Events.STORY_RENDERED, () => {
          setTimeout(() => {
            // extra moment for the dev client to settle
            resolve(0);
          }, 250);
        });
      }),
    ]);

    console.log("Going through all stories");
    await snapshotAllStories();

    exec(`xcrun simctl terminate booted ${appId} || true`, undefined, {
      ignoreError: true,
    });

    closeAll(0);
  } catch (error) {
    closeAll(1);
    throw error;
  }
}
