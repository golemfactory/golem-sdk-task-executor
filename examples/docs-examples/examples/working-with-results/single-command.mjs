import { TaskExecutor, pinoPrettyLogger } from "@golem-sdk/task-executor";

(async () => {
  const executor = await TaskExecutor.create({
    package: "529f7fdaf1cf46ce3126eb6bbcd3b213c314fe8fe884914f5d1106d4",
    logger: pinoPrettyLogger(),
    yagnaOptions: { apiKey: "try_golem" },
  });

  try {
    const result = await executor.run(async (ctx) => await ctx.run("node -v"));
    console.log("Task result:", result);
  } catch (err) {
    console.error("Error during the task:", err);
  } finally {
    await executor.shutdown();
  }
})();
