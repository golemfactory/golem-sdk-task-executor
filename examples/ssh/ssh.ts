import { TaskExecutor } from "@golem-sdk/task-executor";
import { pinoPrettyLogger } from "@golem-sdk/pino-logger";
import { program } from "commander";
import crypto from "crypto";

async function main(subnetTag, driver, network, count = 2, sessionTimeout = 100) {
  const executor = await TaskExecutor.create({
    vpn: true,
    task: {
      maxParallelTasks: count,
    },
    logger: pinoPrettyLogger(),
    payment: { driver, network },
    demand: {
      workload: {
        imageTag: "golem/examples-ssh:latest",
        capabilities: ["vpn"],
      },
      subnetTag,
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
  const appKey = process.env["YAGNA_APPKEY"];
  const runningTasks: Promise<void>[] = [];
  for (let i = 0; i < count; i++) {
    runningTasks.push(
      executor.run(async (exe) => {
        const password = crypto.randomBytes(3).toString("hex");
        try {
          const results = await exe
            .beginBatch()
            .run("syslogd")
            .run("ssh-keygen -A")
            .run(`echo -e "${password}\n${password}" | passwd`)
            .run("/usr/sbin/sshd")
            .end();
          if (!results) return;

          console.log("\n------------------------------------------");
          console.log(`Connect via ssh to provider "${exe.provider?.name}" with:`);
          console.log(
            `ssh -o ProxyCommand='websocat asyncstdio: ${exe.getWebsocketUri(
              22,
            )} --binary -H=Authorization:"Bearer ${appKey}"' root@${crypto.randomBytes(10).toString("hex")}`,
          );
          console.log(`Password: ${password}`);
          console.log("------------------------------------------\n");
          await new Promise((res) => setTimeout(res, sessionTimeout * 1000));
          console.log(`Task completed. Session SSH closed after ${sessionTimeout} secs timeout.`);
        } catch (error) {
          console.error("Computation failed:", error);
        }
      }),
    );
  }
  try {
    await Promise.all(runningTasks);
  } finally {
    await executor.shutdown();
  }
}

program
  .option("--subnet-tag <subnet>", "set subnet name, for example 'public'")
  .option("--payment-driver <paymentDriver>", "payment driver name, for example 'erc20'")
  .option("--payment-network <paymentNetwork>", "network name, for example 'holesky'")
  .option("--task-count, --count <count>", "task count", (val) => parseInt(val))
  .option("-t, --timeout <timeout>", "ssh session timeout (in seconds)", (val) => parseInt(val));
program.parse();
const options = program.opts();
main(options.subnetTag, options.paymentDriver, options.paymentNetwork, options.count, options.timeout);
