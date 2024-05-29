import { TaskExecutor } from "@golem-sdk/task-executor";
import { pinoPrettyLogger } from "@golem-sdk/pino-logger/dist/GolemPinoLogger.js";
import { createHash } from "node:crypto";
import * as fs from "fs";

(async () => {
  const executor = await TaskExecutor.create({
    logger: pinoPrettyLogger({ level: "info" }),
    api: { key: "try_golem" },
    demand: {
      workload: {
        imageTag: "golem/alpine:latest",
      },
    },
    market: {
      maxAgreements: 1,
      rentHours: 0.5,
      pricing: {
        model: "linear",
        maxStartPrice: 0.5,
        maxCpuPerHourPrice: 1.0,
        maxEnvPerHourPrice: 0.5,
      },
    },
  });

  const buff = fs.readFileSync("worker.mjs");
  const hash = createHash("md5").update(buff).digest("hex");

  try {
    const result = await executor.run(async (ctx) => {
      await ctx.uploadFile("./worker.mjs", "/golem/input/worker.mjs");

      const res = await ctx.run(
        `node -e "const crypto = require('node:crypto'); const fs = require('fs'); const buff = fs.readFileSync('/golem/input/worker.mjs'); const hash = crypto.createHash('md5').update(buff).digest('hex'); console.log(hash);"`,
      );

      return res.stdout;
    });

    console.log("md5 of the file sent to provider: ", result);
    console.log("Locally computed md5: ", hash);
  } catch (error) {
    console.error("Computation failed:", error);
  } finally {
    await executor.shutdown();
  }
})();
