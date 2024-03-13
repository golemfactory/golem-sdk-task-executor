import { TaskExecutor, pinoPrettyLogger } from "@golem-sdk/task-executor";

(async () => {
  const executor = await TaskExecutor.create({
    package: "golem/node:20-alpine",
    logger: pinoPrettyLogger(),
    yagnaOptions: { apiKey: "try_golem" },
    maxParallelTasks: 3,
  });

  try {
    const data = [1, 2, 3, 4, 5];
    const futureResults = data.map((item) => executor.run((ctx) => ctx.run(`echo "${item}"`)));
    const results = await Promise.all(futureResults);
    results.forEach((result) => console.log(result.stdout));
  } catch (err) {
    console.error("Error occurred during task execution:", err);
  } finally {
    await executor.shutdown();
  }
})();
