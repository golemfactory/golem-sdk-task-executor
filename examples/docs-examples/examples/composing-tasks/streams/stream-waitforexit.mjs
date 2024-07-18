import { TaskExecutor } from "@golem-sdk/task-executor";
import { pinoPrettyLogger } from "@golem-sdk/pino-logger";

const executor = await TaskExecutor.create({
  logger: pinoPrettyLogger(),
  api: { key: "try_golem" },
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
  },
  task: {
    maxParallelTasks: 1,
  },
});

// the example will run a tasks 4 times, in sequence (as maxParallelTasks is 1)
for (const i of [1, 2, 3, 4]) {
  await executor
    .run(async (exe) => {
      // each task will spawn a script that generates a sequence of 5 pairs of messages sent to stdout and stderr separated by 1 sec delay

      // the command generating the sequence is saved to script.sh file
      await exe.run(
        `echo 'counter=0; while [ $counter -lt 5 ]; do ls -ls ./script.sh non-existing-file; sleep 1; counter=$(($counter+1)); done' > script.sh`,
      );
      // permissions are modified to be able to run the script
      await exe.run("chmod 700 ./script.sh");

      // script is run and stream results, stdout and stderr are processed
      let remoteProcess = await exe.runAndStream("/bin/sh ./script.sh");

      remoteProcess.stdout.subscribe((data) => console.log(`iteration: ${i}:`, "stdout>", data));
      remoteProcess.stderr.subscribe((data) => console.error(`iteration: ${i}:`, "stderr>", data));

      // For odd tasks, we set streaming timeout to 10 secs,
      // the script will end normally, for equal tasks we will exit the run method after 3 secs.
      // The exit caused by timeout will terminate the activity on a provider,
      // therefore the user cannot run another command on the provider.
      // Task executor will run the next task on another provider.

      const timeout = i % 2 === 0 ? 3_000 : 10_000;
      const finalResult = await remoteProcess.waitForExit(timeout).catch(async (e) => {
        console.log(`Iteration: ${i} Error: ${e.message}, Provider: ${exe.provider.name}`);
        exe
          .run("ls -l")
          .catch((e) =>
            console.log("Running command after normal runAndStream exit is NOT possible, you will get an error:\n", e),
          );
      });
      if (finalResult) {
        // if the spawn exited without timeout, the provider is still available
        console.log(`Iteration: ${i} results: ${finalResult?.result}. Provider: ${exe.provider.name}`);

        console.log("Running command after normal runAndStream exit is possible:", (await exe.run("ls -l")).stdout);
      }
    })
    .catch((error) => console.error("Execution of task failed due to error.", error));
}

await executor.shutdown();
