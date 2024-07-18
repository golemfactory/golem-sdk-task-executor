import { TaskExecutor } from "@golem-sdk/task-executor";
import { pinoPrettyLogger } from "@golem-sdk/pino-logger";
import { fileURLToPath } from "url";

const DIR_NAME = fileURLToPath(new URL(".", import.meta.url));

(async function main() {
  const executor = await TaskExecutor.create({
    logger: pinoPrettyLogger({ level: "info" }),
    demand: {
      workload: {
        // if the image url starts with "file://" it will be treated as a local file
        // and the sdk will automatically serve it to the provider
        imageUrl: `file://${DIR_NAME}/alpine.gvmi`,
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
    await executor.run(async (exe) => console.log((await exe.run("cat hello.txt")).stdout));
  } catch (error) {
    console.error("Computation failed:", error);
  } finally {
    await executor.shutdown();
  }
})();
