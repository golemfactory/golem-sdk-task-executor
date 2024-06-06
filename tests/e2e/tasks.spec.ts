import { readFileSync } from "fs";
import { TaskExecutor, ExecutorOptions } from "../../src";
import { sleep } from "../../src/utils";

const executorOptions: ExecutorOptions = {
  demand: {
    workload: {
      imageTag: "golem/alpine:latest",
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
};

describe("Task Executor", function () {
  let executor: TaskExecutor;
  let emittedEventsNames: string[] = [];

  const verifyAllExpectedEventsEmitted = () => {
    // TODO
    // expect(emittedEventsNames).toContain(Events.ProposalReceived.name);
    // expect(emittedEventsNames).toContain(Events.ProposalResponded.name);
    // expect(emittedEventsNames).toContain(Events.AgreementCreated.name);
    // expect(emittedEventsNames).toContain(Events.ActivityCreated.name);
    // expect(emittedEventsNames).toContain(Events.ActivityDestroyed.name);
    // expect(emittedEventsNames).toContain(Events.AgreementTerminated.name);
    // expect(emittedEventsNames).toContain(Events.InvoiceReceived.name);
    // expect(emittedEventsNames).toContain(Events.DebitNoteReceived.name);
    // expect(emittedEventsNames).toContain(Events.PaymentAccepted.name);
  };

  beforeEach(() => {
    emittedEventsNames = [];
  });

  afterEach(async function () {
    await executor?.shutdown();
    verifyAllExpectedEventsEmitted();
  });

  it("should run simple task", async () => {
    executor = await TaskExecutor.create(executorOptions);
    // executor.events.on("golemEvents", (event) => emittedEventsNames.push(event.name));

    const result = await executor.run(async (ctx) => ctx.run("echo 'Hello World'"));

    expect(result?.stdout).toContain("Hello World");
  });

  it("should run simple task and get error for invalid command", async () => {
    executor = await TaskExecutor.create(executorOptions);
    // executor.events.on("golemEvents", (event) => emittedEventsNames.push(event.name));

    const result1 = await executor.run(async (ctx) => ctx.run("echo 'Hello World'"));
    const result2 = await executor.run(async (ctx) => ctx.run("invalid-command"));

    expect(result1?.stdout).toContain("Hello World");
    expect(result2?.result).toEqual("Error");
    expect(result2?.stderr).toContain("sh: invalid-command: not found");
    expect(result2?.message).toEqual("ExeScript command exited with code 127");
  });

  it("should run simple task using package tag", async () => {
    executor = await TaskExecutor.create(executorOptions);
    // executor.events.on("golemEvents", (event) => emittedEventsNames.push(event.name));

    const result = await executor.run(async (ctx) => ctx.run("echo 'Hello World'"));

    expect(result?.stdout).toContain("Hello World");
  });

  it("should run simple tasks by map function", async () => {
    executor = await TaskExecutor.create(executorOptions);
    // executor.events.on("golemEvents", (event) => emittedEventsNames.push(event.name));
    const data = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
    const futureResults = data.map((x) =>
      executor.run(async (ctx) => {
        const res = await ctx.run(`echo "${x}"`);
        return res.stdout?.toString().trim();
      }),
    );
    const finalOutputs = (await Promise.all(futureResults)).filter((x) => !!x);
    expect(finalOutputs).toEqual(expect.arrayContaining(data));
  });

  it("should run simple batch script and get results as stream", async () => {
    executor = await TaskExecutor.create(executorOptions);
    // executor.events.on("golemEvents", (event) => emittedEventsNames.push(event.name));
    let taskDetails;
    executor.events.task.on("taskCompleted", (event) => (taskDetails = event));
    const outputs: string[] = [];
    let onEnd = "";
    await executor
      .run(async (ctx) => {
        const results = await ctx
          .beginBatch()
          .run('echo "Hello Golem"')
          .run('echo "Hello World"')
          .run('echo "OK"')
          .endStream();
        results.on("data", ({ stdout }) => outputs.push(stdout.toString().trim()));
        results.on("close", () => (onEnd = "END"));
      })
      .catch((e) => {
        executor.shutdown();
        expect(e).toBeUndefined();
      });
    await sleep(5);
    expect(taskDetails.id).toEqual("1");
    expect(outputs[0]).toEqual("Hello Golem");
    expect(outputs[1]).toEqual("Hello World");
    expect(outputs[2]).toEqual("OK");
    expect(onEnd).toEqual("END");
  });

  it("should run simple batch script and get results as promise", async () => {
    executor = await TaskExecutor.create(executorOptions);
    // executor.events.on("golemEvents", (event) => emittedEventsNames.push(event.name));
    const outputs: string[] = [];
    await executor
      .run(async (ctx) => {
        const results = await ctx
          .beginBatch()
          .run('echo "Hello Golem"')
          .run('echo "Hello World"')
          .run('echo "OK"')
          .end();
        results.map((r) => outputs.push(r?.stdout?.toString().trim() ?? "Missing STDOUT!"));
      })
      .catch((e) => {
        expect(e).toBeUndefined();
      });
    expect(outputs[0]).toEqual("Hello Golem");
    expect(outputs[1]).toEqual("Hello World");
    expect(outputs[2]).toEqual("OK");
  });

  it("should run transfer file", async () => {
    executor = await TaskExecutor.create(executorOptions);
    // executor.events.on("golemEvents", (event) => emittedEventsNames.push(event.name));

    const result = await executor.run(async (ctx) => {
      await ctx.uploadJson({ test: "1234" }, "/golem/work/test.json");
      const res = await ctx.downloadFile("/golem/work/test.json", "new_test.json");
      return res?.result;
    });

    expect(result).toEqual("Ok");
    expect(readFileSync(`new_test.json`, "utf-8")).toEqual('{"test":"1234"}');
  });

  it("should run transfer file via http", async () => {
    executor = await TaskExecutor.create(executorOptions);
    // executor.events.on("golemEvents", (event) => emittedEventsNames.push(event.name));

    const result = await executor.run(async (ctx) => {
      const res = await ctx.transfer(
        "http://registry.golem.network/download/a2bb9119476179fac36149723c3ad4474d8d135e8d2d2308eb79907a6fc74dfa",
        "/golem/work/alpine.gvmi",
      );
      return res.result;
    });
    expect(result).toEqual("Ok");
  });

  it("should get ip address", async () => {
    executor = await TaskExecutor.create({
      demand: {
        workload: {
          imageTag: "golem/alpine:latest",
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
      vpn: { ip: "192.168.0.0/24" },
    });
    // executor.events.on("golemEvents", (event) => emittedEventsNames.push(event.name));
    const result = await executor.run(async (ctx) => ctx.getIp());
    expect(["192.168.0.2", "192.168.0.3"]).toContain(result);
  });

  it("should run and stream command as external process", async () => {
    executor = await TaskExecutor.create(executorOptions);
    // executor.events.on("golemEvents", (event) => emittedEventsNames.push(event.name));
    let stdout = "";
    let stderr = "";
    const finalResult = await executor.run(async (ctx) => {
      const remoteProcess = await ctx.runAndStream("sleep 1 && echo 'Hello World' && echo 'Hello Golem' >&2");
      remoteProcess.stdout.on("data", (data) => (stdout += data.trim()));
      remoteProcess.stderr.on("data", (data) => (stderr += data.trim()));
      return remoteProcess.waitForExit();
    });
    expect(stdout).toContain("Hello World");
    expect(stderr).toContain("Hello Golem");
    expect(finalResult?.result).toContain("Ok");
  });

  it("should not retry the task if maxTaskRetries is zero", async () => {
    executor = await TaskExecutor.create({
      demand: {
        workload: {
          imageTag: "golem/alpine:latest",
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
        maxTaskRetries: 0,
      },
    });
    // executor.events.on("golemEvents", (event) => emittedEventsNames.push(event.name));
    let isRetry = false;
    executor.events.task.on("taskRetried", () => (isRetry = true));
    try {
      executor.onActivityReady(async (ctx) => Promise.reject("Error"));
      await executor.run(async (ctx) => console.log((await ctx.run("echo 'Hello World'")).stdout));
    } catch (error) {
      await executor.shutdown();
    }
    expect(isRetry).toEqual(false);
  });

  it("should not retry the task if taskRetries is zero", async () => {
    executor = await TaskExecutor.create({
      demand: {
        workload: {
          imageTag: "golem/alpine:latest",
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
        maxTaskRetries: 7,
      },
    });
    // executor.events.on("golemEvents", (event) => emittedEventsNames.push(event.name));
    let isRetry = false;
    executor.events.task.on("taskRetried", () => (isRetry = true));
    try {
      executor.onActivityReady(async (ctx) => Promise.reject("Error"));
      await executor.run(async (ctx) => console.log((await ctx.run("echo 'Hello World'")).stdout), { maxRetries: 0 });
    } catch (error) {
      await executor.shutdown();
    }
    expect(isRetry).toEqual(false);
  });

  it.skip("should clean up the agreements in the pool if the agreement has been terminated by provider", async () => {
    const executor = await TaskExecutor.create({
      demand: {
        workload: {
          imageTag: "golem/alpine:latest",
        },
        // we set mid-agreement payment and a filter that will not pay for debit notes
        payment: {
          debitNotesAcceptanceTimeoutSec: 10,
          midAgreementPaymentTimeoutSec: 10,
          midAgreementDebitNoteIntervalSec: 10,
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
      payment: {
        // which should result in termination of the agreement by provider
        debitNoteFilter: () => Promise.resolve(false),
      },
    });
    // executor.events.on("golemEvents", (event) => emittedEventsNames.push(event.name));
    let createdAgreementsCount = 0;
    // eventTarget.addEventListener(EVENT_TYPE, (event) => {
    //   const ev = event as BaseEvent<unknown>;
    //   if (ev instanceof Events.AgreementCreated) createdAgreementsCount++;
    // });
    try {
      await executor.run(async (ctx) => {
        const proc = await ctx.runAndStream("timeout 15 ping 127.0.0.1");
        proc.stdout.on("data", (data) => console.log(data));
        return await proc.waitForExit(20_000);
      });
      // the first task should be terminated by the provider, the second one should not use the same agreement
      await executor.run(async (ctx) => console.log((await ctx.run("echo 'Hello World'")).stdout));
    } catch (error) {
      throw new Error(`Test failed. ${error}`);
    } finally {
      await executor.shutdown();
    }
    expect(createdAgreementsCount).toBeGreaterThan(1);
  });

  it.skip("should only accept debit notes for agreements that were created by the executor", async () => {
    const executor1 = await TaskExecutor.create(executorOptions);
    const executor2 = await TaskExecutor.create(executorOptions);
    const confirmedAgreementsIds1 = new Set();
    const confirmedAgreementsIds2 = new Set();
    const acceptedPaymentsAgreementIds1 = new Set();
    const acceptedPaymentsAgreementIds2 = new Set();
    // executor1.events.on("golemEvents", (event) => {
    //   const ev = event as BaseEvent<unknown>;
    //   if (ev instanceof Events.AgreementConfirmed) confirmedAgreementsIds1.add(ev.detail.id);
    //   if (ev instanceof Events.DebitNoteAccepted) acceptedPaymentsAgreementIds1.add(ev.detail.agreementId);
    //   if (ev instanceof Events.PaymentAccepted) acceptedPaymentsAgreementIds1.add(ev.detail.agreementId);
    //
    //   emittedEventsNames.push(ev.name);
    // });
    // executor2.events.on("golemEvents", (event) => {
    //   const ev = event as BaseEvent<unknown>;
    //   if (ev instanceof Events.AgreementConfirmed) confirmedAgreementsIds2.add(ev.detail.id);
    //   if (ev instanceof Events.DebitNoteAccepted) acceptedPaymentsAgreementIds2.add(ev.detail.agreementId);
    //   if (ev instanceof Events.PaymentAccepted) acceptedPaymentsAgreementIds2.add(ev.detail.agreementId);
    // });
    try {
      await Promise.all([
        executor1.run(async (ctx) => console.log((await ctx.run("echo 'Executor 1'")).stdout)),
        executor2.run(async (ctx) => console.log((await ctx.run("echo 'Executor 2'")).stdout)),
      ]);
    } catch (error) {
      throw new Error(`Test failed. ${error}`);
    } finally {
      await executor1.shutdown();
      await executor2.shutdown();
    }
    expect(acceptedPaymentsAgreementIds1).toEqual(confirmedAgreementsIds1);
    expect(acceptedPaymentsAgreementIds2).toEqual(confirmedAgreementsIds2);
  });
});
