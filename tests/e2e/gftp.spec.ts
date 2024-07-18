import { TaskExecutor } from "../../src";
import fs from "fs";

import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe("GFTP transfers", function () {
  it(
    "should upload and download big files simultaneously",
    async () => {
      const executor = await TaskExecutor.create({
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
          setup: async (exe) => {
            const sourcePath = fs.realpathSync(resolve(__dirname + "/../fixtures/eiffel.blend"));
            await exe.uploadFile(sourcePath, "/golem/work/eiffel.blend");
          },
        },
      });

      const data = [0, 1, 2, 3, 4, 5];

      const futureResults = data.map((frame) =>
        executor.run(async (exe) => {
          const result = await exe
            .beginBatch()
            .run("ls -Alh /golem/work/eiffel.blend")
            .downloadFile(`/golem/work/eiffel.blend`, `copy_${frame}.blend`)
            .end()
            .catch((error) => console.error(error.toString()));
          return result ? `copy_${frame}.blend` : "";
        }),
      );
      const results = await Promise.all(futureResults);

      const expectedResults = data.map((d) => `copy_${d}.blend`);

      for (const result of results) {
        expect(expectedResults).toContain(result);
      }

      for (const file of expectedResults) {
        expect(fs.existsSync(file)).toEqual(true);
      }

      await executor.shutdown();
    },
    1000 * 240,
  );
});
