import { TaskExecutor, pinoPrettyLogger } from "@golem-sdk/task-executor";

(async () => {
  const executor = await TaskExecutor.create({
    package: "golem/node:20-alpine",
    logger: pinoPrettyLogger(),
    yagnaOptions: { apiKey: "try_golem" },
  });

  try {
    const result = await executor.run(async (ctx) => (await ctx.run("node -v")).stdout);
    console.log("Task result:", result);
  } catch (err) {
    console.error("Error while running the task:", err);
  } finally {
    await executor.shutdown();
  }
})();
