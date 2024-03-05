import { TaskExecutor, pinoLogger, pinoPrettyLogger } from "@golem-sdk/task-executor";
import { nullLogger } from "@golem-sdk/golem-js";
import { program, Option } from "commander";

// Create command-line configuration.
program
  .addOption(
    new Option(
      "-l, --log <type>",
      "Set logger to use. pretty - pino-pretty, json - default pino, debug - debug env lib, null - empty ",
    )
      .default("pretty")
      .choices(["pretty", "json", "debug", "null"]),
  )
  .option("-o, --output <file>", "log output file");

// Parse command-line arguments.
program.parse();
const options = program.opts();

// Create logger based on configuration.
function createLogger(options) {
  if (options.log === "pretty") {
    return pinoPrettyLogger(options?.output);
  } else if (options.log === "json") {
    return pinoLogger(options?.output);
  } else if (options.log === "debug") {
    return undefined;
  } else {
    return nullLogger();
  }
}

(async function main(options) {
  const executor = await TaskExecutor.create({
    package: "golem/alpine:latest",
    logger: createLogger(options),
  });

  try {
    await executor.run(async (ctx) => console.log((await ctx.run("echo 'Hello World'")).stdout));
  } catch (err) {
    console.error("Error while running the task:", err);
  } finally {
    await executor.shutdown();
  }
})(options);
