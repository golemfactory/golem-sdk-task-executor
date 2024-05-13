import { TaskExecutor, pinoPrettyLogger } from "@golem-sdk/task-executor";

(async () => {
  const executor = await TaskExecutor.create({
    package: "golem/alpine:latest",
    logger: pinoPrettyLogger(),
    yagnaOptions: { apiKey: "try_golem" },
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
