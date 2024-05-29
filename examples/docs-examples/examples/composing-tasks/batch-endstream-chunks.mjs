import { TaskExecutor } from "@golem-sdk/task-executor";
import { pinoPrettyLogger } from "@golem-sdk/pino-logger/dist/GolemPinoLogger.js";

(async () => {
  const executor = await TaskExecutor.create({
    logger: pinoPrettyLogger({ level: "info" }),
    api: { key: "try_golem" },
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
    const result = await executor.run(async (ctx) => {
      const res = await ctx
        .beginBatch()
        .uploadFile("./worker.mjs", "/golem/input/worker.mjs")
        .run("node /golem/input/worker.mjs > /golem/input/output.txt")
        .run("cat /golem/input/output.txt")
        .downloadFile("/golem/input/output.txt", "./output.txt")
        .endStream();

      return new Promise((resolve) => {
        res.on("data", (result) => console.log(result));
        res.on("error", (error) => console.error(error));
        res.once("close", resolve);
      });
    });
  } catch (error) {
    console.error("Computation failed:", error);
  } finally {
    await executor.shutdown();
  }
})();
