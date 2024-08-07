import { TaskExecutor } from "@golem-sdk/task-executor";
import { pinoPrettyLogger } from "@golem-sdk/pino-logger";
import { OfferProposalFilter } from "@golem-sdk/golem-js";

/**
 * Example demonstrating how to write a custom proposal filter.
 * In this case the proposal must include VPN access and must not be from "bad-provider"
 */
const myFilter: OfferProposalFilter = (proposal) => {
  return (
    proposal.provider.name !== "bad-provider" || !proposal.properties["golem.runtime.capabilities"]?.includes("vpn")
  );
};

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
      offerProposalFilter: myFilter,
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
