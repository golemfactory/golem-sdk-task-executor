import { TaskExecutor } from "@golem-sdk/task-executor";
import { pinoPrettyLogger } from "@golem-sdk/pino-logger";

(async function main() {
  const executor = await TaskExecutor.create({
    logger: pinoPrettyLogger(),
    api: { key: "try_golem" },
    demand: {
      workload: {
        // What do you want to run
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
      // Control the execution of tasks
      taskTimeout: 5 * 60 * 1000,
    },
  });

  try {
    let result = await executor.run(async (exe) => {
      console.log("Provider deployed");

      await exe.run(
        `echo 'counter=0; while [ $counter -lt 10 ]; do ls ./home non-existing-file; sleep 1; counter=$(($counter+1)); done' > script.sh`,
      );

      await exe.run("chmod 700 ./script.sh");

      let remoteProcess = await exe.runAndStream("/bin/sh ./script.sh");

      remoteProcess.stderr.subscribe((data) => console.error("stderr: ", data));

      await new Promise((resolve) => {
        remoteProcess.stdout.subscribe({
          next: (data) => console.log("stdout: ", data),
          complete: () => resolve(),
        });
      });
    });
    console.log(result);
  } catch (err) {
    console.error("Running the task on Golem failed due to", err);
  } finally {
    await executor.shutdown();
  }
})();
