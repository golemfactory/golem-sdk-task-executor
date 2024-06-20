import { TaskExecutor } from "@golem-sdk/task-executor";
import { pinoPrettyLogger } from "@golem-sdk/pino-logger";

(async () => {
  const executor = await TaskExecutor.create({
    logger: pinoPrettyLogger(),
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
      const res = await exe
        .beginBatch()
        .run("ls -l /golem > /golem/work/output.txt")
        .run("cat /golem/work/output.txt")
        .downloadFile("/golem/work/output.txt", "./output.txt")
        .end();

      return res[2]?.result;
    });

    console.log(result);
  } catch (error) {
    console.error("An error occurred:", error);
  } finally {
    await executor.shutdown();
  }
})();
