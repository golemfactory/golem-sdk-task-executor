const { TaskExecutor } = require("@golem-sdk/task-executor");
const { pinoPrettyLogger } = require("@golem-sdk/pino-logger");

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
    const result = await executor.run(async (exe) => (await exe.run("node -v")).stdout);
    console.log("Task result:", result);
  } catch (err) {
    console.error("Task failed:", err);
  } finally {
    await executor.shutdown();
  }
})();
