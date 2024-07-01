import { TaskExecutor } from "@golem-sdk/task-executor";
import { pinoPrettyLogger } from "@golem-sdk/pino-logger";

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
  },
});
const finalResult = await executor.run(async (exe) => {
  const remoteProcess = await exe.runAndStream("sleep 1 && echo 'Hello World' && echo 'Hello Golem' >&2");
  remoteProcess.stdout.subscribe((data) => console.log("stdout>", data));
  remoteProcess.stderr.subscribe((data) => console.error("stderr>", data));

  const finalResult = await remoteProcess.waitForExit();
  return finalResult;
});

console.log(finalResult);

await executor.shutdown();
