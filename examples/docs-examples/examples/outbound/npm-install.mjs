import { TaskExecutor } from "@golem-sdk/task-executor";
import { pinoPrettyLogger } from "@golem-sdk/pino-logger";
import { readFile } from "fs/promises";

const manifest = await readFile(`./manifest_npm_install.json`);

(async function main() {
  const executor = await TaskExecutor.create({
    logger: pinoPrettyLogger(),
    api: { key: "try_golem" },
    demand: {
      workload: {
        manifest: manifest.toString("base64"),
        capabilities: ["inet", "manifest-support"],
      },
      expirationSec: 60 * 30, //30 min
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
    // Control the execution of tasks
    task: {
      maxTaskRetries: 0,
      taskTimeout: 120 * 60 * 1000,
    },
  });

  try {
    await executor.run(async (exe) => {
      console.log("working on provider: ", exe.provider.id);

      console.log((await exe.run("npm install moment")).stdout);
      console.log((await exe.run(`cat ./package.json`)).stdout);

      return 1;
    });

    console.log("task completed");
  } catch (err) {
    console.error("Running the task on Golem failed due to", err);
  } finally {
    await executor.shutdown();
  }
})();
