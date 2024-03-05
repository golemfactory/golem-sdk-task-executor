import { TaskExecutor, pinoPrettyLogger } from "@golem-sdk/task-executor";

(async function main() {
  const executor = await TaskExecutor.create({
    package: "golem/alpine:latest",
    logger: pinoPrettyLogger(),
    midAgreementPaymentTimeoutSec: 10,
    debitNotesAcceptanceTimeoutSec: 10,
  });

  try {
    const results = await executor.run(async (ctx) => {
      const res1 = await ctx.run('echo "Hello"');
      const res2 = await ctx.run('echo "World"');
      return `${res1.stdout}${res2.stdout}`;
    });
    console.log(results);
  } catch (err) {
    console.error("An error occurred during execution:", err);
  } finally {
    await executor.shutdown();
  }
})();
