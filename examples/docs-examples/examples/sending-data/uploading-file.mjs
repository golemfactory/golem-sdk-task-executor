import { TaskExecutor, pinoPrettyLogger } from "@golem-sdk/task-executor";
import { createHash } from "node:crypto";
import * as fs from "fs";

(async () => {
  const executor = await TaskExecutor.create({
    package: "golem/node:20-alpine",
    logger: pinoPrettyLogger(),
    yagnaOptions: { apiKey: "try_golem" },
  });

  try {
    const buff = fs.readFileSync("worker.mjs");
    const hash = createHash("md5").update(buff).digest("hex");

    const result = await executor.run(async (ctx) => {
      await ctx.uploadFile("./worker.mjs", "/golem/input/worker.mjs");

      const res = await ctx.run(
        `node -e "const crypto = require('node:crypto'); const fs = require('fs'); const buff = fs.readFileSync('/golem/input/worker.mjs'); const hash = crypto.createHash('md5').update(buff).digest('hex'); console.log(hash); "`,
      );

      return res.stdout;
    });

    console.log("md5 of the file sent to provider: ", result);
    console.log("Locally computed md5: ", hash);
  } catch (err) {
    console.error("An error occurred:", err);
  } finally {
    await executor.shutdown();
  }
})();
