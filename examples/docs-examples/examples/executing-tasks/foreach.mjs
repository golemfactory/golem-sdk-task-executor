import { TaskExecutor } from "@golem-sdk/task-executor";
import { pinoPrettyLogger } from "@golem-sdk/pino-logger";

(async () => {
  const executor = await TaskExecutor.create({
    logger: pinoPrettyLogger(),
    api: { key: "try_golem" },
    demand: {
      workload: {
        imageTag: "golem/alpine:latest",
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
    const data = [1, 2, 3, 4, 5];

    for (const item of data) {
      await executor.run(async (ctx) => {
        console.log((await ctx.run(`echo "${item}"`)).stdout);
      });
    }
  } catch (err) {
    console.error("An error occurred during execution", err);
  } finally {
    await executor.shutdown();
  }
})();
