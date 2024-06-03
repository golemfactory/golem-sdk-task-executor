import { TaskExecutor, ProposalFilterFactory } from "@golem-sdk/task-executor";
import { pinoPrettyLogger } from "@golem-sdk/pino-logger";

/**
 * Example demonstrating how to use the predefined filter `allowProvidersByName`,
 * which only allows offers from a provider whose name is in the array
 */

const whiteListNames = ["provider-2", "fractal_01_3.h", "sharkoon_379_0.h", "fractal_01_1.h", "sharkoon_379_1.h"];
console.log("Will accept only proposals from:");
for (let i = 0; i < whiteListNames.length; i++) {
  console.log(whiteListNames[i]);
}

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
      proposalFilter: ProposalFilterFactory.allowProvidersByName(whiteListNames),
    },
  });

  try {
    await executor.run(async (ctx) =>
      console.log((await ctx.run(`echo "This task is run on ${ctx.provider.name}"`)).stdout),
    );
  } catch (err) {
    console.error("An error occurred:", err);
  } finally {
    await executor.shutdown();
  }
})();
