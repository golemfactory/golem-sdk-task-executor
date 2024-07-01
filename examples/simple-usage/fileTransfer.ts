import { TaskExecutor } from "@golem-sdk/task-executor";
import { pinoPrettyLogger } from "@golem-sdk/pino-logger";
import { readFileSync, realpathSync } from "fs";

(async function main() {
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
  try {
    const sourcePath = realpathSync("../tests/mock/fixtures/eiffel.blend");
    await executor.run(async (exe) => {
      await exe.uploadFile(sourcePath, "/golem/work/eiffel.blend");
      const res = await exe.downloadFile("/golem/work/eiffel.blend", "eiffel.blend");
      console.log(`Result=${res.result}`);
      console.log("File eiffel.blend: ", readFileSync("eiffel.blend", "utf-8"));
    });
  } catch (err) {
    console.error("Execution failed", err);
  } finally {
    await executor.shutdown();
  }
})();
