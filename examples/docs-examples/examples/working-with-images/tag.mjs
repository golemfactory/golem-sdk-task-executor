import { TaskExecutor } from "@golem-sdk/task-executor";
import { pinoPrettyLogger } from "@golem-sdk/pino-logger";

const executor = await TaskExecutor.create({
  package: "golem/alpine:latest",
  logger: pinoPrettyLogger(),
  yagnaOptions: { apiKey: "try_golem" },
});

try {
  const result = await executor.run(async (ctx) => (await ctx.run("node -v")).stdout);
  console.log("Task result:", result);
} catch (err) {
  console.error("An error occurred:", err);
} finally {
  await executor.shutdown();
}
