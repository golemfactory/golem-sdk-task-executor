import { TaskExecutor } from "@golem-sdk/task-executor";
import { pinoPrettyLogger } from "@golem-sdk/pino-logger";
(async () => {
  const executor = await TaskExecutor.create({
    logger: pinoPrettyLogger(),
    api: { key: "try_golem" },
    demand: {
      workload: {
        imageHash: "8b238595299444d0733b41095f27fadd819a71d29002b614c665b27c",
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
    const result = await executor.run(async (exe) => {
      console.log("Description.txt: ", (await exe.run("cat /golem/info/description.txt")).stdout);
      console.log("/golem/work content: ", (await exe.run("ls /golem/work")).stdout);
    });
  } catch (err) {
    console.error("An error occurred:", err);
  } finally {
    await executor.shutdown();
  }
})();
