import { TaskExecutor, pinoPrettyLogger, ResultState } from "@golem-sdk/task-executor";

(async function main() {
  const executor = await TaskExecutor.create({
    package: "golem/alpine:latest",
    logger: pinoPrettyLogger(),
  });
  const data = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

  try {
    const futureResults = data.map((x) =>
      executor.run(async (ctx) => {
        const cmd = x === "seven" ? "undefined_command_causing_error" : `echo "${x}"`;
        const res = await ctx.run(cmd);
        if (res.result === ResultState.Error) {
          throw new Error(`Some error occurred. ${res.message}`);
        }
        return res.stdout?.toString().trim();
      }),
    );

    const results = await Promise.allSettled(futureResults);
    const successResults = results.filter((res) => res.status === "fulfilled");
    const failureResults = results.filter((res) => res.status === "rejected");
    console.log("Success results:", successResults);
    console.log("Failure results:", failureResults);
  } catch (err) {
    console.error("An error occurred:", err);
  } finally {
    await executor.shutdown();
  }
})();
