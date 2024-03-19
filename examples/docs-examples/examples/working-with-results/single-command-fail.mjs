import { TaskExecutor, pinoPrettyLogger } from "@golem-sdk/task-executor";

(async () => {
  const executor = await TaskExecutor.create({
    package: "golem/node:20-alpine",
    logger: pinoPrettyLogger(),
    yagnaOptions: { apiKey: "try_golem" },
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
