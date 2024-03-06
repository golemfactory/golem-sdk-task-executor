import { TaskExecutor, pinoPrettyLogger } from "@golem-sdk/task-executor";

(async function main() {
  const executor = await TaskExecutor.create({
    package: "golem/alpine:latest",
    logger: pinoPrettyLogger(),
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
