import { TaskExecutor, pinoPrettyLogger } from "@golem-sdk/task-executor";

(async () => {
  const executor = await TaskExecutor.create({
    package: "golem/node:20-alpine",
    logger: pinoPrettyLogger(),
    yagnaOptions: { apiKey: "try_golem" },
    maxParallelTasks: 3,
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
