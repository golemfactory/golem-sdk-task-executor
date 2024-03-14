import { TaskExecutor, pinoPrettyLogger } from "@golem-sdk/task-executor";

(async function main() {
  const executor = await TaskExecutor.create({
    package: "golem/alpine:latest",
    logger: pinoPrettyLogger(),
  });
  try {
    await executor.run(async (ctx) => console.log((await ctx.run("echo 'Hello World'")).stdout));
  } catch (error) {
    console.error("Computation failed:", error);
  } finally {
    await executor.shutdown();
  }
})();
