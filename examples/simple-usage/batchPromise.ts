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
      maxAgreements: 1,
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
    await executor.run(async (ctx) => {
      const res = await ctx.beginBatch().run('echo "Hello Golem"').run('echo "Hello World"').end();
      res?.map(({ stdout }) => console.log(stdout));
    });
  } catch (error) {
    console.log("Error while running the task:", error);
  } finally {
    await executor.shutdown();
  }
})();
