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
    payment: { network: "polygon" },
  });

  try {
    const result = await executor.run(async (exe) => (await exe.run("node -v")).stdout);
    console.log("Task result:", result);
  } catch (err) {
    console.error("Computation failed:", error);
  } finally {
    await executor.shutdown();
  }
})();
