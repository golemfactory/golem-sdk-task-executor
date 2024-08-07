import { TaskExecutor } from "@golem-sdk/task-executor";
import { pinoPrettyLogger } from "@golem-sdk/pino-logger";
import { program } from "commander";

async function main(args) {
  const executor = await TaskExecutor.create({
    logger: pinoPrettyLogger(),
    api: { key: "try_golem" },
    demand: {
      workload: {
        imageHash: "055911c811e56da4d75ffc928361a78ed13077933ffa8320fb1ec2db",
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
      maxParallelTasks: args.numberOfProviders,
    },
  });

  const keyspace = await executor.run(async (exe) => {
    const result = await exe.run(`hashcat --keyspace -a 3 ${args.mask} -m 400`);
    return parseInt(result.stdout || "");
  });

  if (!keyspace) throw new Error(`Cannot calculate keyspace`);

  console.log(`Keyspace size computed. Keyspace size = ${keyspace}.`);
  const step = Math.floor(keyspace / args.numberOfProviders);
  const range = [...Array(Math.floor(keyspace / step)).keys()].map((i) => i * step);

  const findPasswordInRange = async (skip) => {
    const password = await executor.run(async (exe) => {
      const [, potfileResult] = await exe
        .beginBatch()
        .run(`hashcat -a 3 -m 400 '${args.hash}' '${args.mask}' --skip=${skip} --limit=${step} -o pass.potfile || true`)
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
}

program
  .option("--number-of-providers <number_of_providers>", "number of providers", (value) => parseInt(value), 3)
  .option("--mask <mask>")
  .requiredOption("--hash <hash>");
program.parse();
const options = program.opts();
main(options).catch((error) => console.error(error));
