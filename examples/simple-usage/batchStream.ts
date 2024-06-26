import { TaskExecutor, pinoPrettyLogger } from "@golem-sdk/task-executor";

(async function main() {
  const executor = await TaskExecutor.create({
    package: "golem/alpine:latest",
    logger: pinoPrettyLogger(),
  });
  try {
    await executor.run(async (ctx) => {
      const results = await ctx.beginBatch().run('echo "Hello Golem"').run('echo "Hello World"').endStream();
      results.on("data", ({ stdout }) => console.log(stdout));
      results.on("error", (error) => console.error(error.toString()));
      results.on("close", () => console.log("END"));
    });
  } catch (error) {
    console.error("Computation failed:", error);
  } finally {
    await executor.shutdown();
  }
})();
