import { TaskExecutor } from "@golem-sdk/task-executor";
import { pinoPrettyLogger } from "@golem-sdk/pino-logger";

(async () => {
  const executor = await TaskExecutor.create({
    logger: pinoPrettyLogger({ level: "info" }),
    api: { key: "try_golem" },
    demand: {
      workload: {
        imageTag: "golem/node:20-alpine",
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
    const result = await executor.run(async (exe) => {
      await exe.uploadFile("./worker.mjs", "/golem/input/worker.mjs");
      await exe.run("node /golem/input/worker.mjs > /golem/input/output.txt");
      const result = await exe.run("cat /golem/input/output.txt");
      await exe.downloadFile("/golem/input/output.txt", "./output.txt");
      return result.stdout;
    });

    console.log(result);
  } catch (err) {
    console.error("An error occurred:", err);
  } finally {
    await executor.shutdown();
  }
})();
