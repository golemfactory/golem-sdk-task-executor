import { TaskExecutor } from "@golem-sdk/task-executor";
import { pinoPrettyLogger } from "@golem-sdk/pino-logger";

const manifest = {
  version: "0.1.0",
  metadata: {
    name: "TM",
    description: "Test Manifest ",
    version: "0.1.0",
  },
  payload: [
    {
      platform: { os: "linux", arch: "x86_64" },
      hash: "sha3:dad8f776b0eb9f37ea0d63de42757034dd085fe30cc4537c2e119d80",
      urls: ["http://registry.golem.network/download/f37c8ba2b534ca631060fb8db4ac218d3199faf656aa2c92f402c2b700797c21"],
    },
  ],
  compManifest: {
    version: "0.1.0",
    net: {
      inet: {
        out: {
          protocols: ["http", "https"],
        },
      },
    },
  },
};

// get whitelist to urls array
const whitelistUrl = "https://raw.githubusercontent.com/golemfactory/ya-installer-resources/main/whitelist/strict.lst";

const urls = await fetch(whitelistUrl).then(async (res) =>
  (await res.text())
    .split("\n")
    .filter((url) => !!url)
    .map((url) => `https://${url}`),
);

const today = new Date(new Date().setUTCHours(0, 0, 0, 0));

manifest.createdAt = today.toISOString();
manifest.expiresAt = new Date(today.setDate(today.getDate() + 2)).toISOString();

//urls.pop();   // line skips last entry - for test only
manifest.compManifest.net.inet.out.urls = urls;

(async function main() {
  const executor = await TaskExecutor.create({
    logger: pinoPrettyLogger(),
    api: { key: "try_golem" },
    demand: {
      workload: {
        capabilities: ["inet", "manifest-support"],
        manifest: Buffer.from(JSON.stringify(manifest)).toString("base64"),
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

  try {
    const result = await executor.run(async (exe) => {
      return (await exe.run("echo Whitelist check")).result;
    });
    console.log(result);
  } catch (err) {
    console.error("The task failed due to", err);
  } finally {
    await executor.shutdown();
  }
})();
