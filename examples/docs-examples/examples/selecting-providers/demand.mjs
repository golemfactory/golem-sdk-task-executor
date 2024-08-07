import { TaskExecutor } from "@golem-sdk/task-executor";
import { pinoPrettyLogger } from "@golem-sdk/pino-logger";

(async function main() {
  const executor = await TaskExecutor.create({
    logger: pinoPrettyLogger(),
    api: { key: "try_golem" },
    demand: {
      workload: {
        imageTag: "golem/node:20-alpine", //minCpuCores : 2,
        //minMemGib : 8,
        //minStorageGib: 10,
        minCpuThreads: 1,
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
    await executor.run(async (exe) => console.log((await exe.run("echo 'Hello World'")).stdout));
  } catch (err) {
    console.error("An error occurred:", err);
  } finally {
    await executor.shutdown();
  }
})();
