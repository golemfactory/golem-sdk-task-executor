import { TaskExecutor } from "@golem-sdk/task-executor";
import { readFileSync, realpathSync } from "fs";

(async function main() {
  const executor = await TaskExecutor.create("golem/alpine:latest");
  try {
    const sourcePath = realpathSync("../tests/mock/fixtures/eiffel.blend");
    await executor.run(async (ctx) => {
      await ctx.uploadFile(sourcePath, "/golem/work/eiffel.blend");
      const res = await ctx.downloadFile("/golem/work/eiffel.blend", "eiffel.blend");
      console.log(`Result=${res.result}`);
      console.log("File eiffel.blend: ", readFileSync("eiffel.blend", "utf-8"));
    });
  } catch (err) {
    console.error("Execution failed", err);
  } finally {
    await executor.shutdown();
  }
})();
