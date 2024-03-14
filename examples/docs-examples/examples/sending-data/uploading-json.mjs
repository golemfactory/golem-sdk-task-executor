import { TaskExecutor, pinoPrettyLogger } from "@golem-sdk/task-executor";

(async () => {
  const executor = await TaskExecutor.create({
    package: "golem/alpine:latest",
    logger: pinoPrettyLogger(),
    yagnaOptions: { apiKey: "try_golem" },
  });

  try {
    const output = await executor.run(async (ctx) => {
      // Upload test JSON object
      await ctx.uploadJson({ input: "Hello World" }, "/golem/work/input.json");
      // Read the content of the JSON object.
      return await ctx.run("cat /golem/work/input.json");
    });

    console.log(output.stdout);
  } catch (err) {
    console.error("An error occurred:", err);
  } finally {
    await executor.shutdown();
  }
})();
