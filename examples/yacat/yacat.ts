import { TaskExecutor } from "@golem-sdk/task-executor";
import { pinoPrettyLogger } from "@golem-sdk/pino-logger";
import { program } from "commander";

type MainOptions = {
  numberOfProviders: number;
  subnetTag: string;
  paymentNetwork: string;
  mask: string;
  paymentDriver: "erc20";
  hash: string;
};

program
  .option("--subnet-tag <subnet>", "set subnet name, for example 'public'")
  .option("--payment-driver, --driver <driver>", "payment driver name, for example 'erc20'")
  .option("--payment-network, --network <network>", "network name, for example 'holesky'")
  .option("--number-of-providers <number_of_providers>", "number of providers", (value) => parseInt(value), 2)
  .option("--mask <mask>")
  .requiredOption("--hash <hash>")
  .action(async (args: MainOptions) => {
    const executor = await TaskExecutor.create({
      logger: pinoPrettyLogger({ level: "info" }),
      demand: {
        workload: {
          imageTag: "golem/examples-hashcat:latest",
          minMemGib: 0.5,
          minStorageGib: 2,
        },
        subnetTag: args.subnetTag,
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
        maxParallelTasks: args.numberOfProviders,
        taskTimeout: 1000 * 60 * 8, // 8 min
      },
      payment: { driver: args.paymentDriver, network: args.paymentNetwork },
    });

    const keyspace = await executor.run<number>(async (exe) => {
      const result = await exe.run(`hashcat --keyspace -a 3 ${args.mask} -m 400`);
      return parseInt(result.stdout?.toString().trim() || "");
    });

    if (!keyspace) throw new Error(`Cannot calculate keyspace`);
    const step = Math.floor(keyspace / args.numberOfProviders);
    const range = [...Array(Math.floor(keyspace / step)).keys()].map((i) => i * step);
    console.log(`Keyspace size computed. Keyspace size = ${keyspace}. Tasks to compute = ${range.length}`);

    const findPasswordInRange = async (skip: number) => {
      const password = await executor.run(async (exe) => {
        const [, potfileResult] = await exe
          .beginBatch()
          .run(
            `hashcat -a 3 -m 400 '${args.hash}' '${args.mask}' --skip=${skip} --limit=${step} -o pass.potfile || true`,
          )
          .run("cat pass.potfile || true")
          .end();
        if (!potfileResult.stdout) return false;
        // potfile format is: hash:password
        return potfileResult.stdout.toString().trim().split(":")[1];
      });
      if (!password) {
        throw new Error(`Cannot find password in range ${skip} - ${skip + step}`);
      }
      return password;
    };

    try {
      const password = await Promise.any(range.map(findPasswordInRange));
      console.log(`Password found: ${password}`);
    } catch (err) {
      console.log(`Password not found`);
    } finally {
      await executor.shutdown();
    }
  });

program.parse();
