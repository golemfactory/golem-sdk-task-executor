import { TaskExecutor } from "@golem-sdk/task-executor";
import { pinoPrettyLogger } from "@golem-sdk/pino-logger";
import { OfferProposal } from "@golem-sdk/golem-js";

/**
 * Example demonstrating how to write a selector which choose the best provider based on scores provided as object: [providerName]: score
 * A higher score rewards the provider.
 */
const scores = {
  "provider-1": 100,
  "golem-provider": 50,
  "super-provider": 25,
};

/** Selector selecting the provider according to the provided list of scores */
const bestAgreementSelector = (scores: { [providerName: string]: number }) => (proposals: OfferProposal[]) => {
  proposals.sort((a, b) => ((scores?.[a.provider.name] || 0) >= (scores?.[b.provider.name] || 0) ? 1 : -1));
  return proposals[0];
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
      offerProposalSelector: bestAgreementSelector(scores),
    },
  });

  try {
    await executor.run(async (exe) => console.log((await exe.run("echo 'Hello World'")).stdout));
  } catch (error) {
    console.error("Computation failed:", error);
  } finally {
    await executor.shutdown();
  }
})();
