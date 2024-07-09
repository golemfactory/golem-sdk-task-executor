import { TaskExecutor } from "@golem-sdk/task-executor";
import { pinoPrettyLogger } from "@golem-sdk/pino-logger";
import { program } from "commander";
import { fileURLToPath } from "url";

const DIR_NAME = fileURLToPath(new URL(".", import.meta.url));

const blenderParams = (frame) => ({
  scene_file: "/golem/resource/scene.blend",
  resolution: [400, 300],
  use_compositing: false,
  crops: [
    {
      outfilebasename: "out",
      borders_x: [0.0, 1.0],
      borders_y: [0.0, 1.0],
    },
  ],
  samples: 100,
  frames: [frame],
  output_format: "PNG",
  RESOURCES_DIR: "/golem/resources",
  WORK_DIR: "/golem/work",
  OUTPUT_DIR: "/golem/output",
});

async function main(subnetTag: string, driver?: "erc20", network?: string, maxParallelTasks?: number) {
  const setup = async (exe) => {
    console.log("Uploading the scene to the provider %s", exe.provider.name);
    await exe.uploadFile(`${DIR_NAME}/cubes.blend`, "/golem/resource/scene.blend");
    console.log("Upload of the scene to the provider %s finished", exe.provider.name);
  };
  const executor = await TaskExecutor.create({
    task: {
      maxParallelTasks,
      setup,
    },
    logger: pinoPrettyLogger(),
    payment: { driver, network },
    demand: {
      workload: { imageTag: "golem/blender:latest" },
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

  try {
    const futureResults = [0, 10, 20, 30, 40, 50].map(async (frame) =>
      executor.run(async (exe) => {
        console.log("Started rendering of frame %d on provider %s", frame, exe.provider.name);

        const result = await exe
          .beginBatch()
          .uploadJson(blenderParams(frame), "/golem/work/params.json")
          .run("/golem/entrypoints/run-blender.sh")
          .downloadFile(`/golem/output/out${frame?.toString().padStart(4, "0")}.png`, `${DIR_NAME}/output_${frame}.png`)
          .end();

        console.log("Finished rendering of frame %d on provider %s", frame, exe.provider.name);

        return result?.length ? `output_${frame}.png` : "";
      }),
    );

    console.log("Scheduling all tasks");
    const results = await Promise.all(futureResults);
    console.log("Completed all tasks");

    results.forEach((result) => console.log(result));
  } catch (error) {
    console.error("Computation failed:", error);
  } finally {
    await executor.shutdown();
  }
}

program
  .option("--subnet-tag <subnet>", "set subnet name, for example 'public'")
  .option("--payment-driver, --driver <driver>", "payment driver name, for example 'erc20'")
  .option("--payment-network, --network <network>", "network name, for example 'holesky'")
  .option("-t, --max-parallel-tasks <maxParallelTasks>", "max parallel tasks");
program.parse();
const options = program.opts();
main(options.subnetTag, options.driver, options.network, options.maxParallelTasks);
