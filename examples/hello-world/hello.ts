import { TaskExecutor, pinoPrettyLogger } from "@golem-sdk/task-executor";

(async function main() {
  const executor = await TaskExecutor.create({
    package: "golem/alpine:latest_wrong", // <-- wrong tag
    // package: "529f7fdaf1cf46ce3126eb6bbcd3b213c314fe8fe884999999999999", // <- or wrong imageHash
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
