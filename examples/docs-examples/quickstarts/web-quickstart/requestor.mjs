import * as golem from "https://unpkg.com/@golem-sdk/task-executor";

function appendResults(result) {
  const results = document.getElementById("results");
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(result));
  results.appendChild(div);
}

function appendLog(msg, level = "info") {
  const logs = document.getElementById("logs");
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(`[${new Date().toISOString()}] [${level}] ${msg}`));
  logs.appendChild(div);
}

const logger = {
  error: (msg) => appendLog(msg, "error"),
  info: (msg) => appendLog(msg, "info"),
  warn: (msg) => appendLog(msg, "warn"),
  debug: (msg) => appendLog(msg, "debug"),
  child: () => logger,
};

async function run() {
  const executor = await golem.TaskExecutor.create({
    logger,
    api: { key: "try_golem", url: document.getElementById("YAGNA_API_BASEPATH").value },
    demand: {
      workload: {
        imageTag: "golem/alpine:latest",
      },
      subnetTag: document.getElementById("SUBNET_TAG").value,
    },
    market: {
      maxAgreements: 1,
      rentHours: 0.5,
      pricing: {
        model: "linear",
        maxStartPrice: 0.5,
        maxCpuPerHourPrice: 1.0,
        maxEnvPerHourPrice: 0.5,
      },
    },
    payment: { network: document.getElementById("PAYMENT_NETWORK").value },
  });

  try {
    await executor.run(async (ctx) => appendResults((await ctx.run("echo 'Hello World'")).stdout));
  } catch (error) {
    logger.error("Computation failed:", error);
  } finally {
    await executor.shutdown();
  }
}

document.getElementById("echo").onclick = run;
