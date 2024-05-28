import { TaskExecutor } from "@golem-sdk/task-executor";
import { pinoPrettyLogger } from "@golem-sdk/pino-logger";

(async function main() {
  const executor = await TaskExecutor.create({
    package: "golem/alpine:latest",
    logger: pinoPrettyLogger(),
    taskTimeout: 20 * 60 * 1000, // 20 MIN
    yagnaOptions: { apiKey: "try_golem" },
  });

  // Golem-js core events
  executor.events.on("golemEvents", (event) => {
    console.log(event.name, event.detail);
  });

  // TaskExecutor specific events
  executor.events.on("taskStarted", (event) => {
    console.log("Task started:", event);
  });
  executor.events.on("taskCompleted", (event) => {
    console.log("Task completed:", event);
  });

  console.log("Executor is created");
  try {
    await executor.run(async (ctx) => {
      console.log("Will run the command");
      console.log((await ctx.run("ls -l")).stdout);
    });
    console.log("Finished");
  } catch (err) {
    console.error("This error broke the computations", err);
  } finally {
    console.log("Will shutdown the executor.");
    await executor.shutdown();
  }
})();
