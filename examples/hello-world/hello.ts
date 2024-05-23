import { TaskExecutor } from "@golem-sdk/task-executor";
import { pinoPrettyLogger } from "@golem-sdk/pino-logger";

(async function main() {
  const executor = await TaskExecutor.create({
    demand: { activity: { imageTag: "golem/alpine:latest" }},
    market: {
      rentHours: 1,
      pricing: {
        model: "linear",
        maxStartPrice: 1,
        maxCpuPerHourPrice: 1,
        maxEnvPerHourPrice: 1,
      },
      withProviders: ["0x123123"],
      withoutProviders: ["0x123123"],
      withOperators: ["0x123123"],
      withoutOperators: ["0x123123"],
    },
    logger: pinoPrettyLogger({ level: "info"}),
  });
  try {
    await executor.run(async (ctx) => console.log((await ctx.run("echo 'Hello World'")).stdout));
  } catch (error) {
    console.error("Computation failed:", error);
  } finally {
    await executor.shutdown();
  }
})();
