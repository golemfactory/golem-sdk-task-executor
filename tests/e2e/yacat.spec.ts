import { TaskExecutor } from "../../src";

const range = (start: number, end: number, step = 1): number[] => {
  const list: number[] = [];
  for (let index = start; index < end; index += step) list.push(index);
  return list;
};

describe("Password cracking", function () {
  let executor: TaskExecutor;
  it(
    "should crack password",
    async () => {
      const mask = "?a?a";
      const hash = "$P$5ZDzPE45CigTC6EY4cXbyJSLj/pGee0";
      executor = await TaskExecutor.create({
        demand: {
          workload: {
            /**
             * Using the latest yacat image tag `golem/examples-hashcat:latest`
             * causes problems with providers in docker:
             * Error: `Device #1: Not enough allocatable device memory for this attack`,
             * So for now we leave the old version with image hash for docker test
             */
            imageHash: "055911c811e56da4d75ffc928361a78ed13077933ffa8320fb1ec2db",
            minMemGib: 0.5,
            minStorageGib: 2,
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
          maxParallelTasks: 3,
        },
      });
      const keyspace = await executor.run<number>(async (exe) => {
        const result = await exe.run(`hashcat --keyspace -a 3 ${mask} -m 400`);
        return parseInt(result.stdout?.toString() || "");
      });
      expect(keyspace).toEqual(95);
      if (!keyspace) return;
      const step = Math.floor(keyspace / 3);
      const ranges = range(0, keyspace, step);

      const findPasswordInRange = async (skip: number) => {
        const password = await executor.run(async (exe) => {
          const [, potfileResult] = await exe
            .beginBatch()
            .run(`hashcat -a 3 -m 400 '${hash}' '${mask}' --skip=${skip} --limit=${step} -o pass.potfile || true`)
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

      await expect(Promise.any(ranges.map(findPasswordInRange))).resolves.toEqual("yo");
      await executor.shutdown();
    },
    1000 * 60 * 5,
  );
});
