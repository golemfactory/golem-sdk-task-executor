import crypto from "crypto";
import { TaskExecutor } from "../../src";
import { spawn } from "child_process";

describe("SSH connection", function () {
  let executor: TaskExecutor;
  it("should connect to provider via ssh", async () => {
    executor = await TaskExecutor.create({
      vpn: { ip: "192.168.0.0/24" },
      demand: {
        workload: {
          imageTag: "golem/examples-ssh:latest",
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
    });
    let websocketUri;
    const password = crypto.randomBytes(3).toString("hex");
    let stdout = "";
    let processSsh;
    await executor.run(async (exe) => {
      websocketUri = exe.getWebsocketUri(22);
      const results = await exe
        .beginBatch()
        .run("syslogd")
        .run("ssh-keygen -A")
        .run(`echo -e "${password}\n${password}" | passwd`)
        .run("/usr/sbin/sshd")
        .end()
        .catch((error) => console.error(error));
      expect(results?.[3]?.result).toEqual("Ok");
      expect(websocketUri).toEqual(expect.any(String));
      processSsh = spawn(
        `sshpass -p ${password} ssh`,
        [
          "-o",
          "UserKnownHostsFile=/dev/null",
          "-o",
          "StrictHostKeyChecking=no",
          "-o",
          `ProxyCommand='websocat asyncstdio: ${websocketUri} --binary -H=Authorization:"Bearer ${process.env.YAGNA_APPKEY}"'`,
          `root@${crypto.randomBytes(10).toString("hex")}`,
          "uname -v",
        ],
        { shell: true },
      );
      processSsh.stdout.on("data", (data) => (stdout += data.toString()));
    });
    await new Promise((res) => setTimeout(res, 3000));
    expect(stdout).toContain("1-Alpine SMP");
    processSsh.kill();
    await executor.shutdown();
  });
});
