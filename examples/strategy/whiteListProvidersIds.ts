import { TaskExecutor, ProposalFilterFactory, pinoPrettyLogger } from "@golem-sdk/task-executor";

/**
 * Example demonstrating how to use the predefined filter `allowProvidersById`,
 * which only allows offers from a provider whose id is in the array
 */

const whiteListIds = [
  "0x79bcfdc92af492c9b15ce9f690c3ccae53437179",
  "0x3c6a3f59518a0da1e75ea4351713bfe908e6642c",
  "0x1c1c0b14e321c258f7057e29533cba0081df8bb8",
];

(async function main() {
  const executor = await TaskExecutor.create({
    package: "golem/alpine:latest",
    logger: pinoPrettyLogger(),
    proposalFilter: ProposalFilterFactory.allowProvidersById(whiteListIds),
  });

  try {
    await executor.run(async (ctx) => console.log((await ctx.run("echo 'Hello World'")).stdout));
  } catch (err) {
    console.error("Task execution failed:", err);
  } finally {
    await executor.shutdown();
  }
})();
