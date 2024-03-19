import { TaskExecutor, pinoPrettyLogger } from "@golem-sdk/task-executor";

(async () => {
  const executor = await TaskExecutor.create({
    package: "golem/node:20-alpine",
    logger: pinoPrettyLogger(),
    yagnaOptions: { apiKey: "try_golem" },
  });

  try {
    const result = await executor.run(async (ctx) => {
      const res = await ctx
        .beginBatch()
        .uploadFile("./worker.mjs", "/golem/input/worker.mjs")
        .run("node /golem/input/worker.mjs > /golem/input/output.txt")
        .run("cat /golem/input/output.txt")
        .downloadFile("/golem/input/output.txt", "./output.txt")
        .endStream();

      return new Promise((resolve, reject) => {
        res.on("data", (result) => console.log(result));
        res.on("error", (error) => reject(error));
        res.on("close", resolve);
      });
    });
  } catch (err) {
    console.error("An error occurred:", err);
  } finally {
    await executor.shutdown();
  }
})();
