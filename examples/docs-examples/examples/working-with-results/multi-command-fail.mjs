import { TaskExecutor, pinoPrettyLogger } from "@golem-sdk/task-executor";

(async () => {
  const executor = await TaskExecutor.create({
    package: "golem/alpine:latest",
    logger: pinoPrettyLogger(),
    yagnaOptions: { apiKey: "try_golem" },
  });

  try {
    const result = await executor.run(async (ctx) => {
      const res = await ctx
        .beginBatch()
        .run("cat /golem/input/output.txt > /golem/input/output.txt")
        .downloadFile("/golem/output/output.txt", "./output.txt") // there is no such file in output folder
        .run("ls -l /golem/")
        .end();

      return res;
    });

    console.log(result);
  } catch (error) {
    console.error("An error occurred:", error);
  } finally {
    await executor.shutdown();
  }
})();
