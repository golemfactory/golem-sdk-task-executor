import { TaskExecutor } from "../../src";
import { sleep } from "../../src/utils";
import fs from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe("TcpProxy", function () {
  it("should send and receive message to the http server on the provider", async () => {
    const executor = await TaskExecutor.create({
      vpn: { ip: "192.168.0.0/24" },
      demand: {
        workload: {
          imageTag: "golem/node:20-alpine",
          capabilities: ["vpn"],
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

    const response = await executor.run(async (exe) => {
      await exe.uploadFile(
        fs.realpathSync(resolve(__dirname + "../../../examples/proxy/server.js")),
        "/golem/work/server.js",
      );

      // Just run it in background, will be terminated by `executor.shutdown()`
      const server = await exe.runAndStream("node /golem/work/server.js");
      const proxy = exe.createTcpProxy(80);
      await proxy.listen(7777);
      await sleep(10);

      const response = await fetch("http://localhost:7777")
        .then((res) => res.text())
        .then((text) => text.trim());

      await proxy.close();

      return response;
    });

    await executor.shutdown();
    expect(response).toEqual("Hello Golem!");
  });
});
