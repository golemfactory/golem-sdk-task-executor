import { TaskExecutor } from "@golem-sdk/task-executor";
import { pinoPrettyLogger } from "@golem-sdk/pino-logger";
import { OfferProposal } from "@golem-sdk/golem-js";

/**
 * Example demonstrating how to use predefined selector `bestAgreementSelector`,
 * which choose the best provider based on scores provided as object: [providerId]: score
 * A higher score rewards the provider.
 */
const scores = {
  "0x79bcfdc92af492c9b15ce9f690c3ccae53437179": 100,
  "0x3c6a3f59518a0da1e75ea4351713bfe908e6642c": 50,
  "0x1c1c0b14e321c258f7057e29533cba0081df8bb8": 25,
};

/** Selector selecting the provider according to the provided list of scores */
const bestAgreementSelector = (scores: { [providerId: string]: number }) => (proposals: OfferProposal[]) => {
  proposals.sort((a, b) => ((scores?.[a.provider.id] || 0) >= (scores?.[b.provider.id] || 0) ? 1 : -1));
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
