import { TaskExecutor } from "@golem-sdk/task-executor";
import { pinoPrettyLogger } from "@golem-sdk/pino-logger";

(async () => {
  const executor = await TaskExecutor.create({
    logger: pinoPrettyLogger(),
    api: { key: "try_golem" },
    demand: {
      workload: {
        imageTag: "golem/node:20-alpine",
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
    const results = await executor.run(async (ctx) => {
      const res = await ctx
        .beginBatch()
        .run("cat /golem/input/output.txt > /golem/input/output.txt")
        .downloadFile("/golem/output/output.txt", "./output.txt") // there is no such file in output folder
        .run("ls -l /golem/")
        .end();

      return res;
    });

    // TE will not be terminated on command error, user should review the results and take action
    for (const commandResult of results) {
      if (commandResult.result != "Ok") {
        console.log("\n", "\x1b[31m", commandResult.message, "\n", "\x1b[0m");
        break;
      }
    }
  } catch (error) {
    console.error("An error occurred:", error);
  } finally {
    await executor.shutdown();
  }
})();
