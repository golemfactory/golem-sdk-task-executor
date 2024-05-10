import { TaskExecutor, pinoPrettyLogger } from "@golem-sdk/task-executor";

(async function main() {
  const executor = await TaskExecutor.create({
    package: "golem/alpine:latest",
    logger: pinoPrettyLogger(),
  });
  const data = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

  try {
    const futureResults = data.map((x) =>
      executor.run(async (ctx) => {
        const res = await ctx.run(`echo "${x}"`);
        return res.stdout?.toString().trim();
      }),
    );

    const results = await Promise.allSettled(futureResults);
    const successResults = results.filter((res) => res.status === "fulfilled");
    console.log("Results:", successResults);
  } catch (err) {
    console.error("An error occurred:", err);
  } finally {
    await executor.shutdown();
  }
})();
