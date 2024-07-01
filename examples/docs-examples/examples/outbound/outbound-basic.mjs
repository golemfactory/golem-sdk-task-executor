import { TaskExecutor } from "@golem-sdk/task-executor";
import { pinoPrettyLogger } from "@golem-sdk/pino-logger";
import { readFile } from "fs/promises";

// The example is using url from domain that is included in the outbound Whitelist.
// See https://github.com/golemfactory/ya-installer-resources/tree/main/whitelist for the current default whitelist.

const url = "https://ipfs.io/ipfs/bafybeihkoviema7g3gxyt6la7vd5ho32ictqbilu3wnlo3rs7ewhnp7lly";

(async function main() {
  // Load the manifest.
  const manifest = await readFile(`./manifest.json`);

  // Create and configure a TaskExecutor instance.
  const executor = await TaskExecutor.create({
    logger: pinoPrettyLogger(),
    api: { key: "try_golem" },
    demand: {
      workload: {
        capabilities: ["inet", "manifest-support"],
        manifest: manifest.toString("base64"),
      },
    },
    market: {
      rentHours: 0.5,
      pricing: {
        model: "linear",
        maxStartPrice: 0.5,
        maxCpuPerHourPrice: 1.0,
        maxEnvPerHourPrice: 0.5,
      },
    },
  });

  try {
    await executor.run(async (exe) => {
      const result = await exe.run(`curl ${url} -o /golem/work/example.jpg`);

      console.log((await exe.run("ls -l")).stdout);
      if (result.result === "Ok") {
        console.log("File downloaded!");
      } else {
        console.error("Failed to download the file!", result.stderr);
      }
    });
  } catch (err) {
    console.error("The task failed due to", err);
  } finally {
    await executor.shutdown();
  }
})();
