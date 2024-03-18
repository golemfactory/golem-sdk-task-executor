import { TaskExecutor, pinoPrettyLogger } from "@golem-sdk/task-executor";

(async function main() {
  const executor = await TaskExecutor.create({
    // What do you want to run
    package: "f4a261ea7b760a1da10f21f0ad8d704c25c8d2c75d0bf16300b9721e",
    logger: pinoPrettyLogger(),
    yagnaOptions: { apiKey: "try_golem" },
    budget: 0.5,
    // Control the execution of tasks
    taskTimeout: 5 * 60 * 1000,
  });

  try {
    let result = await executor.run(async (ctx) => {
      console.log("Provider deployed");

      await ctx.run(
        `echo 'counter=0; while [ $counter -lt 10 ]; do ls ./home non-existing-file; sleep 1; counter=$(($counter+1)); done' > script.sh`,
      );

      await ctx.run("chmod 700 ./script.sh");

      let remoteProcess = await ctx.runAndStream("/bin/sh ./script.sh");

      remoteProcess.stdout.on("data", (data) => console.log("stdout: ", data));
      remoteProcess.stderr.on("data", (data) => console.error("stderr: ", data));

      await new Promise((resolve) => {
        remoteProcess.stdout.on("close", resolve);
      });
      return 0;
    });
    console.log(result);
  } catch (err) {
    console.error("Running the task on Golem failed due to", err);
  } finally {
    await executor.shutdown();
  }
})();
