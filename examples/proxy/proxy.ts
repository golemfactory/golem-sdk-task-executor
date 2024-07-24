import { TaskExecutor } from "@golem-sdk/task-executor";
import { pinoPrettyLogger } from "@golem-sdk/pino-logger";

/**
 * An example demonstrating the use of a proxy server to send and receive http requests to the provider.
 * After starting the proxy server, you can make any http request
 * that will be processed by the http server on the provider's machine, eg. `curl http://localhost`
 */
(async function main() {
  const executor = await TaskExecutor.create({
    skipProcessSignals: true,
    logger: pinoPrettyLogger({ level: "info" }),
    task: {
      // Restart the HTTP server up to 5 times
      maxTaskRetries: 5,
      // If you're using TaskExecutor, you want the "task" to last long in that case
      taskTimeout: 60 * 60 * 1000, // 60 minutes
    },
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
    vpn: { ip: "192.168.0.0/24" },
  });

  try {
    await executor.run(async (exe) => {
      const PORT_ON_PROVIDER = 80;
      const PORT_ON_REQUESTOR = 8080;

      // Install the server script
      await exe.uploadFile(`./proxy/server.js`, "/golem/work/server.js");

      // Start the server process on the provider
      const server = await exe.runAndStream(`PORT=${PORT_ON_PROVIDER} node /golem/work/server.js`);

      server.stdout.subscribe((data) => console.log("provider>", data));
      server.stderr.subscribe((data) => console.error("provider>", data));

      // Create a proxy instance
      const proxy = exe.createTcpProxy(PORT_ON_PROVIDER);
      proxy.events.on("error", (error) => console.error("TcpProxy reported an error:", error));

      // Start listening and expose the port on your requestor machine

      await proxy.listen(PORT_ON_REQUESTOR);

      console.log(`Server Proxy listen at http://localhost:${PORT_ON_REQUESTOR}`);

      // Prepare and register shutdown handlers for graceful termination
      let isClosing = false;
      const stopTask = async () => {
        if (isClosing) {
          console.log("Already closing, ignoring subsequent shutdown request");
          return;
        }

        isClosing = true;

        console.log("Shutting down gracefully");
        await proxy.close();
        // It's OK to end here as once the task is finished, the TaskExecutor will terminate the underling activity on the provider
        // leading to a shutdown of the server.
      };

      return new Promise<void>((res) => {
        console.log("Registered handlers...");
        process.on("SIGINT", () => stopTask().then(() => res()));
      });
    });
  } catch (error) {
    console.error("Proxy example failed:", error);
  } finally {
    await executor.shutdown();
  }
})();
