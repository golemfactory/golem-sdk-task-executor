import { TaskExecutor } from "@golem-sdk/task-executor";
import { pinoPrettyLogger } from "@golem-sdk/pino-logger";
import { PaymentFilters } from "@golem-sdk/golem-js";
/**
 * Example demonstrating how to use the predefined payment filter `acceptMaxAmountDebitNoteFilter`,
 * which only accept debit notes below 0.00001 GLM.
 */
(async function main() {
  const executor = await TaskExecutor.create({
    logger: pinoPrettyLogger({ level: "info" }),
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
    payment: {
      debitNoteFilter: PaymentFilters.acceptMaxAmountDebitNoteFilter(0.00001),
    },
  });

  try {
    await executor.run(async (exe) => console.log((await exe.run("echo 'Hello World'")).stdout));
  } catch (err) {
    console.error("Task execution failed:", err);
  } finally {
    await executor.shutdown();
  }
})();
