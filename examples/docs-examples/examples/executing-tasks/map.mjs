import { TaskExecutor } from "@golem-sdk/task-executor";
import { pinoPrettyLogger } from "@golem-sdk/pino-logger/dist/GolemPinoLogger.js";

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
    const data = [1, 2, 3, 4, 5];

    const futureResults = data.map(async (item) =>
      executor.run(async (ctx) => {
        return await ctx.run(`echo "${item}"`);
      }),
    );

    const results = await Promise.allSettled(futureResults);
    results.forEach((result) => {
      if (result.status === "fulfilled") {
        console.log("Success", result.value.stdout);
      } else {
        console.log("Failure", result.value.reason);
      }
    });
  } catch (err) {
    console.error("An error occurred:", err);
  } finally {
    await executor.shutdown();
  }
})();
