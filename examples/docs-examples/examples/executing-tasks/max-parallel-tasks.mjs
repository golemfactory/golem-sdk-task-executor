import { TaskExecutor } from "@golem-sdk/task-executor";
import { pinoPrettyLogger } from "@golem-sdk/pino-logger";

(async () => {
  const executor = await TaskExecutor.create({
    logger: pinoPrettyLogger(),
    api: { key: "try_golem" },
    demand: {
      workload: {
        imageTag: "golem/alpine:latest",
      },
    },
    market: {
      rentHours: 0.5,
      pricing: {
        model: "linear",
        maxStartPrice: 0.5,
        maxCpuPerHourPrice: 1.0,
        maxEnvPerHourPrice: 0.5,
      },
    },
    task: {
      maxParallelTasks: 3,
    },
  });

  try {
    const data = [1, 2, 3, 4, 5];
    const futureResults = data.map((item) => executor.run((exe) => exe.run(`echo "${item}"`)));
    const results = await Promise.allSettled(futureResults);
    results.forEach((result) => {
      if (result.status === "fulfilled") {
        console.log("Success", result.value.stdout);
      } else {
        console.log("Failure", result.value.reason);
      }
    });
  } catch (err) {
    console.error("Error occurred during task execution:", err);
  } finally {
    await executor.shutdown();
  }
})();
