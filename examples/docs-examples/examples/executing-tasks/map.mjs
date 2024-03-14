import { TaskExecutor, pinoPrettyLogger } from "@golem-sdk/task-executor";

(async () => {
  const executor = await TaskExecutor.create({
    package: "golem/alpine:latest",
    logger: pinoPrettyLogger(),
    yagnaOptions: { apiKey: "try_golem" },
  });

  try {
    const data = [1, 2, 3, 4, 5];

    const futureResults = data.map(async (item) =>
      executor.run(async (ctx) => {
        return await ctx.run(`echo "${item}"`);
      }),
    );

    const results = await Promise.all(futureResults);
    results.forEach((result) => console.log(result.stdout));
  } catch (err) {
    console.error("An error occurred:", err);
  } finally {
    await executor.shutdown();
  }
})();
