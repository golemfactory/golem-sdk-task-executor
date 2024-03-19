import { TaskExecutor, pinoPrettyLogger, ProposalFilterFactory } from "@golem-sdk/task-executor";

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
    package: "golem/alpine:latest",
    proposalFilter: ProposalFilterFactory.allowProvidersByName(whiteListNames),
    logger: pinoPrettyLogger(),
    yagnaOptions: { apiKey: "try_golem" },
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
