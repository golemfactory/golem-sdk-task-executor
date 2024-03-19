import { TaskExecutor, pinoPrettyLogger } from "@golem-sdk/task-executor";

(async () => {
  const executor = await TaskExecutor.create({
    package: "golem/node:20-alpine",
    logger: pinoPrettyLogger(),
    yagnaOptions: { apiKey: "try_golem" },
  });

  try {
    const result = await executor.run(async (ctx) => {
      await ctx.uploadFile("./worker.mjs", "/golem/input/worker.mjs");
      await ctx.run("node /golem/input/worker.mjs > /golem/input/output.txt");
      const result = await ctx.run("cat /golem/input/output.txt");
      await ctx.downloadFile("/golem/input/output.txt", "./output.txt");
      return result.stdout;
    });

    console.log(result);
  } catch (err) {
    console.error("An error occurred:", err);
  } finally {
    await executor.shutdown();
  }
})();
