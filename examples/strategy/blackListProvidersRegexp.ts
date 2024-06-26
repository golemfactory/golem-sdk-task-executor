import { TaskExecutor, ProposalFilterFactory, pinoPrettyLogger } from "@golem-sdk/task-executor";

/**
 * Example demonstrating how to use the predefined selector `disallowProvidersByNameRegex`,
 * which blocking any proposal coming from a provider whose name match to the regexp
 */

(async function main() {
  const executor = await TaskExecutor.create({
    package: "golem/alpine:latest",
    logger: pinoPrettyLogger(),
    proposalFilter: ProposalFilterFactory.disallowProvidersByNameRegex(/bad-provider*./),
  });

  try {
    await executor.run(async (ctx) => console.log((await ctx.run("echo 'Hello World'")).stdout));
  } catch (err) {
    console.error("Task execution failed:", err);
  } finally {
    await executor.shutdown();
  }
})();
