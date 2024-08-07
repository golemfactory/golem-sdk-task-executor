import { TaskExecutor } from "@golem-sdk/task-executor";
import { pinoPrettyLogger } from "@golem-sdk/pino-logger";
import { program } from "commander";

type MainOptions = {
  subnetTag: string;
  paymentDriver: "erc20";
  paymentNetwork: string;
  tasksCount: number;
  fibonacciNumber: number;
};

program
  .option("-n, --fibonacci-number <n>", "fibonacci number", "1")
  .option("-c, --tasks-count <c>", "tasks count", "1")
  .option("--subnet-tag <subnet>", "set subnet name, for example 'public'", "public")
  .option("--payment-driver, --driver <driver>", "payment driver name, for example 'erc20'", "erc20")
  .option("--payment-network, --network <network>", "network name, for example 'holesky'", "holesky")
  .action(async (options: MainOptions) => {
    const executor = await TaskExecutor.create({
      logger: pinoPrettyLogger({ level: "info" }),
      demand: {
        workload: {
          imageTag: "golem/js-fibonacci:latest",
        },
        subnetTag: options.subnetTag,
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
      payment: { driver: options.paymentDriver, network: options.paymentNetwork },
    });

    const runningTasks: Promise<string | undefined>[] = [];
    for (let i = 0; i < options.tasksCount; i++) {
      runningTasks.push(
        executor.run(async (exe) => {
          const result = await exe.run("/usr/local/bin/node", [
            "/golem/work/fibo.js",
            options.fibonacciNumber.toString(),
          ]);
          console.log(result.stdout);
          return result.stdout?.toString().trim();
        }),
      );
    }

    try {
      await Promise.all(runningTasks);
    } finally {
      await executor.shutdown();
    }
  });

program.parse();
