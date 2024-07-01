import { TaskExecutor } from "@golem-sdk/task-executor";
import { ReputationSystem } from "@golem-sdk/golem-js/experimental";
import { sleep } from "@golem-sdk/golem-js";
import { pinoPrettyLogger } from "@golem-sdk/pino-logger";

/**
 * This example uses the reputation system to filter out proposals from providers with low reputation and ones that were not tested yet.
 *
 * This improves the likelihood of successful computations.
 *
 * This is an experimental feature and the API is subject to change.
 *
 * @experimental
 */
(async function main() {
  console.log("WARNING: This test always run on polygon, so real costs will occur.");
  console.log("If you do not wish to continue, press Ctrl+C to abort.");
  console.log("The test will start in 5 seconds...");
  await sleep(5, false);

  const reputation = await ReputationSystem.create({
    paymentNetwork: "polygon",
  });

  console.log("Listed providers:", reputation.getData().testedProviders.length);

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
      offerProposalFilter: reputation.offerProposalFilter(),
      offerProposalSelector: reputation.agreementSelector(),
    },
    payment: { network: "polygon" },
  });

  try {
    await executor.run(async (exe) => {
      const result = await exe.run("echo 'Hello World'");
      console.log(result.stdout);
    });
  } catch (error) {
    console.error("Computation failed:", error);
  } finally {
    await executor.shutdown();
  }
})();
