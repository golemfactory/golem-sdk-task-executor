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
    task: {
      maxParallelTasks: 3,
    },
  });

  executor.onActivityReady(async (ctx) => {
    console.log(ctx.provider.name + " is downloading action_log file");
    await ctx.uploadFile("./action_log.txt", "/golem/input/action_log.txt");
  });

  const inputs = [1, 2, 3, 4, 5];

  try {
    const futureResults = inputs.map(async (item) => {
      return await executor.run(async (ctx) => {
        await ctx
          .beginBatch()
          .run(`echo 'processing item: ${item}' >> /golem/input/action_log.txt`)
          .downloadFile("/golem/input/action_log.txt", `./output_${ctx.provider.name}.txt`)
          .end();
      });
    });
    await Promise.all(futureResults);
  } catch (error) {
    console.error("A critical error occurred:", error);
  } finally {
    await executor.shutdown();
  }
})();
