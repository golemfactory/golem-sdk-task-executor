import { TaskExecutor, pinoPrettyLogger } from "@golem-sdk/task-executor";

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
    package: "golem/node:20-alpine",
    proposalFilter: myFilter,
    logger: pinoPrettyLogger(),
    yagnaOptions: { apiKey: "try_golem" },
    startupTimeout: 60_000,
  });

  try {
    await executor.run(async (ctx) => {
      const result = await ctx.run('echo "This task is run on ${ctx.provider.id}"');
      console.log(result.stdout, ctx.provider.id);
    });
  } catch (err) {
    console.error("An error occurred:", err);
  } finally {
    await executor.shutdown();
  }
})();
