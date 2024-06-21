import { TaskExecutor } from "@golem-sdk/task-executor";
import { pinoPrettyLogger } from "@golem-sdk/pino-logger";

(async function main() {
  const executor = await TaskExecutor.create({
    logger: pinoPrettyLogger(),
    api: { key: "try_golem" },
    demand: {
      workload: {
        imageTag: "golem/alpine:latest",
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
    task: {
      taskTimeout: 20 * 60 * 1000, // 20 MIN
    },
  });

  // Golem-js core events
  executor.glm.market.events.on("agreementApproved", (event) => {
    console.log("Agreement approved:", event);
  });
  executor.glm.payment.events.on("invoiceReceived", (event) => {
    console.log("Invoice received:", event);
  });
  executor.glm.activity.events.on("activityCreated", (event) => {
    console.log("Activity created:", event);
  });

  // TaskExecutor specific events
  executor.events.on("taskStarted", (event) => {
    console.log("Task started:", event);
  });
  executor.events.on("taskCompleted", (event) => {
    console.log("Task completed:", event);
  });
  executor.events.on("executorEnd", (event) => {
    console.log("All tasks finished:", event);
  });

  console.log("Executor is created");
  try {
    await executor.run(async (exe) => {
      console.log("Will run the command");
      console.log((await exe.run("ls -l")).stdout);
    });
    console.log("Finished");
  } catch (err) {
    console.error("This error broke the computations", err);
  } finally {
    console.log("Will shutdown the executor.");
    await executor.shutdown();
  }
})();
