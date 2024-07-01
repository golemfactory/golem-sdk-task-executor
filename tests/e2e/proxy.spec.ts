import { TaskExecutor } from "../../src";
import { sleep } from "../../src/utils";
import fs from "fs";
import { resolve, dirname } from "path";
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
    let response;
    let providerStdout = "";
    await executor.run(async (exe) => {
      await exe.uploadFile(
        fs.realpathSync(resolve(__dirname + "../../../examples/proxy/server.js")),
        "/golem/work/server.js",
      );
      const server = await exe.runAndStream("node /golem/work/server.js");
      server.stdout.subscribe((data) => (providerStdout += data?.toString()));
      const proxy = exe.createTcpProxy(80);
      await proxy.listen(7777);
      await sleep(10);
      response = await fetch("http://localhost:7777");
      await proxy.close();
    });
    await executor.shutdown();
    expect((await response.text()).trim()).toEqual("Hello Golem!");
    expect(providerStdout).toContain('HTTP server started at "http://localhost:80"');
  });
});
