import { TaskExecutor } from "@golem-sdk/task-executor";
import { pinoPrettyLogger } from "@golem-sdk/pino-logger";

(async function main() {
  const executor = await TaskExecutor.create({
    logger: pinoPrettyLogger({ level: "info" }),
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
  });
  try {
    await executor.run(async (exe) => {
      const results = await exe.beginBatch().run('echo "Hello Golem"').run('echo "Hello World"').endStream();
      results.subscribe({
        next: ({ stdout }) => console.log(stdout),
        error: (error) => console.error(error.toString()),
        complete: () => console.log("END"),
      });
    });
  } catch (error) {
    console.error("Computation failed:", error);
  } finally {
    await executor.shutdown();
  }
})();
