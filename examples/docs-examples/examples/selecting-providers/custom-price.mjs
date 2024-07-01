import { TaskExecutor } from "@golem-sdk/task-executor";
import { pinoPrettyLogger } from "@golem-sdk/pino-logger";

/**
 * Example demonstrating how to write a custom proposal filter.
 */

var costData = [];

const myFilter = (proposal) => {
  let decision = false;
  let usageVector = proposal.properties["golem.com.usage.vector"];
  let counterIdx = usageVector.findIndex((ele) => ele === "golem.usage.duration_sec");
  let proposedCost = proposal.properties["golem.com.pricing.model.linear.coeffs"][counterIdx];
  costData.push(proposedCost);
  if (costData.length < 6) return false;
  else {
    costData.shift();
    let averageProposedCost = costData.reduce((part, x) => part + x, 0) / 5;
    if (proposedCost <= 1.2 * averageProposedCost) decision = true;
    if (decision) {
      console.log(proposedCost, averageProposedCost);
    }
  }
  console.log(costData);
  console.log(proposal.properties["golem.node.id.name"], proposal.properties["golem.com.pricing.model.linear.coeffs"]);
  return decision;
};

(async function main() {
  const executor = await TaskExecutor.create({
    logger: pinoPrettyLogger(),
    api: { key: "try_golem" },
    demand: {
      workload: {
        imageTag: "golem/node:20-alpine",
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
    task: {
      startupTimeout: 60_000,
    },
  });

  try {
    await executor.run(async (exe) => {
      const result = await exe.run(`echo "This task is run on ${exe.provider.id}"`);
      console.log(result.stdout, exe.provider.id);
    });
  } catch (err) {
    console.error("An error occurred:", err);
  } finally {
    await executor.shutdown();
  }
})();
