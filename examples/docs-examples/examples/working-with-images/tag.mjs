import { TaskExecutor } from "@golem-sdk/task-executor";
import { pinoPrettyLogger } from "@golem-sdk/pino-logger/dist/GolemPinoLogger.js";

const executor = await TaskExecutor.create({
  logger: pinoPrettyLogger(),
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
  const result = await executor.run(async (ctx) => (await ctx.run("node -v")).stdout);
  console.log("Task result:", result);
} catch (err) {
  console.error("An error occurred:", err);
} finally {
  await executor.shutdown();
}
