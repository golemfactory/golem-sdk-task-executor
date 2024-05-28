import { TaskExecutor } from "@golem-sdk/task-executor";
import { pinoPrettyLogger } from "@golem-sdk/pino-logger";

(async () => {
  const executor = await TaskExecutor.create({
    logger: pinoPrettyLogger({ level: "info" }),
    api: { key: "try_golem" },
    demand: {
      workload: {
        imageTag: "golem/alpine:latest",
      },
    },
    market: {
      maxAgreements: 1,
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
    // there is a mistake and instead of 'node -v' we call 'node -w'
    const result = await executor.run(async (ctx) => await ctx.run("node -w"));
    console.log("Task result:", result);
  } catch (err) {
    console.error("Error during the task:", err);
  } finally {
    await executor.shutdown();
  }
})();
