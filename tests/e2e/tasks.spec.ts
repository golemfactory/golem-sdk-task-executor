import { readFileSync } from "fs";
import { TaskExecutor, TaskExecutorOptions, ExecutorEvents } from "../../src";
import { sleep } from "../../src/utils";
import EventEmitter from "eventemitter3";
import { ActivityEvents, MarketEvents, PaymentEvents } from "@golem-sdk/golem-js";

const executorOptions: TaskExecutorOptions = {
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
  const emittedEventsNames = new Set<string>();

  const handleEvents = (
    executorEvents: EventEmitter<ExecutorEvents>,
    golemEvents: {
      market: EventEmitter<MarketEvents>;
      activity: EventEmitter<ActivityEvents>;
      payment: EventEmitter<PaymentEvents>;
    },
  ) => {
    executorEvents.on("taskStarted", () => emittedEventsNames.add("taskStarted"));
    executorEvents.on("taskCompleted", () => emittedEventsNames.add("taskCompleted"));
    golemEvents.market.on("offerProposalReceived", () => emittedEventsNames.add("offerProposalReceived"));
    golemEvents.market.on("agreementApproved", () => emittedEventsNames.add("agreementApproved"));
    golemEvents.activity.on("activityCreated", () => emittedEventsNames.add("activityCreated"));
    golemEvents.activity.on("exeUnitInitialized", () => emittedEventsNames.add("exeUnitInitialized"));
    golemEvents.activity.on("scriptExecuted", () => emittedEventsNames.add("scriptExecuted"));
    golemEvents.payment.on("debitNoteReceived", () => emittedEventsNames.add("debitNoteReceived"));
    golemEvents.payment.on("invoiceAccepted", () => emittedEventsNames.add("invoiceAccepted"));
  };

  const verifyAllExpectedEventsEmitted = () => {
    expect(emittedEventsNames).toContain("taskStarted");
    expect(emittedEventsNames).toContain("taskCompleted");
    expect(emittedEventsNames).toContain("offerProposalReceived");
    expect(emittedEventsNames).toContain("agreementApproved");
    expect(emittedEventsNames).toContain("activityCreated");
    expect(emittedEventsNames).toContain("exeUnitInitialized");
    expect(emittedEventsNames).toContain("scriptExecuted");
    expect(emittedEventsNames).toContain("debitNoteReceived");
    expect(emittedEventsNames).toContain("invoiceAccepted");
  };

  beforeEach(() => {
    emittedEventsNames.clear();
  });

  afterEach(async function () {
    await executor?.shutdown();
    verifyAllExpectedEventsEmitted();
  });

  it("should run simple task", async () => {
    executor = await TaskExecutor.create(executorOptions);
    handleEvents(executor.events, {
      market: executor.glm.market.events,
      activity: executor.glm.activity.events,
      payment: executor.glm.payment.events,
    });

    const result = await executor.run(async (exe) => exe.run("echo 'Hello World'"));

    expect(result?.stdout).toContain("Hello World");
  });

  it("should run simple task and get error for invalid command", async () => {
    executor = await TaskExecutor.create(executorOptions);
    handleEvents(executor.events, {
      market: executor.glm.market.events,
      activity: executor.glm.activity.events,
      payment: executor.glm.payment.events,
    });

    const result1 = await executor.run(async (exe) => exe.run("echo 'Hello World'"));
    const result2 = await executor.run(async (exe) => exe.run("invalid-command"));

    expect(result1?.stdout).toContain("Hello World");
    expect(result2?.result).toEqual("Error");
    expect(result2?.stderr).toContain("sh: invalid-command: not found");
    expect(result2?.message).toEqual("ExeScript command exited with code 127");
  });

  it("should run simple task using package tag", async () => {
    executor = await TaskExecutor.create(executorOptions);
    handleEvents(executor.events, {
      market: executor.glm.market.events,
      activity: executor.glm.activity.events,
      payment: executor.glm.payment.events,
    });

    const result = await executor.run(async (exe) => exe.run("echo 'Hello World'"));

    expect(result?.stdout).toContain("Hello World");
  });

  it("should run simple tasks by map function", async () => {
    executor = await TaskExecutor.create(executorOptions);
    handleEvents(executor.events, {
      market: executor.glm.market.events,
      activity: executor.glm.activity.events,
      payment: executor.glm.payment.events,
    });
    const data = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
    const futureResults = data.map((x) =>
      executor.run(async (exe) => {
        const res = await exe.run(`echo "${x}"`);
        return res.stdout?.toString().trim();
      }),
    );
    const finalOutputs = (await Promise.all(futureResults)).filter((x) => !!x);
    expect(finalOutputs).toEqual(expect.arrayContaining(data));
  });

  it("should run simple batch script and get results as stream", async () => {
    executor = await TaskExecutor.create(executorOptions);
    handleEvents(executor.events, {
      market: executor.glm.market.events,
      activity: executor.glm.activity.events,
      payment: executor.glm.payment.events,
    });
    let taskDetails;
    executor.events.on("taskCompleted", (event) => (taskDetails = event));
    const outputs: string[] = [];
    let onEnd = "";
    await executor
      .run(async (exe) => {
        const results = await exe
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
    handleEvents(executor.events, {
      market: executor.glm.market.events,
      activity: executor.glm.activity.events,
      payment: executor.glm.payment.events,
    });
    const outputs: string[] = [];
    await executor
      .run(async (exe) => {
        const results = await exe
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
    handleEvents(executor.events, {
      market: executor.glm.market.events,
      activity: executor.glm.activity.events,
      payment: executor.glm.payment.events,
    });

    const result = await executor.run(async (exe) => {
      await exe.uploadJson({ test: "1234" }, "/golem/work/test.json");
      const res = await exe.downloadFile("/golem/work/test.json", "new_test.json");
      return res?.result;
    });

    expect(result).toEqual("Ok");
    expect(readFileSync(`new_test.json`, "utf-8")).toEqual('{"test":"1234"}');
  });

  it("should run transfer file via http", async () => {
    executor = await TaskExecutor.create(executorOptions);
    handleEvents(executor.events, {
      market: executor.glm.market.events,
      activity: executor.glm.activity.events,
      payment: executor.glm.payment.events,
    });

    const result = await executor.run(async (exe) => {
      const res = await exe.transfer(
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
    handleEvents(executor.events, {
      market: executor.glm.market.events,
      activity: executor.glm.activity.events,
      payment: executor.glm.payment.events,
    });
    const result = await executor.run(async (exe) => exe.getIp());
    expect(["192.168.0.2", "192.168.0.3"]).toContain(result);
  });

  it("should run and stream command as external process", async () => {
    executor = await TaskExecutor.create(executorOptions);
    handleEvents(executor.events, {
      market: executor.glm.market.events,
      activity: executor.glm.activity.events,
      payment: executor.glm.payment.events,
    });
    let stdout = "";
    let stderr = "";
    const finalResult = await executor.run(async (exe) => {
      const remoteProcess = await exe.runAndStream("sleep 1 && echo 'Hello World' && echo 'Hello Golem' >&2");
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

    handleEvents(executor.events, {
      market: executor.glm.market.events,
      activity: executor.glm.activity.events,
      payment: executor.glm.payment.events,
    });
    let isRetry = false;
    executor.events.on("taskRetried", () => (isRetry = true));
    try {
      executor.onExeUnitReady(async (exe) => Promise.reject("Error"));
      await executor.run(async (exe) => console.log((await exe.run("echo 'Hello World'")).stdout));
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

    handleEvents(executor.events, {
      market: executor.glm.market.events,
      activity: executor.glm.activity.events,
      payment: executor.glm.payment.events,
    });
    let isRetry = false;
    executor.events.on("taskRetried", () => (isRetry = true));
    try {
      executor.onExeUnitReady(async (exe) => Promise.reject("Error"));
      await executor.run(async (exe) => console.log((await exe.run("echo 'Hello World'")).stdout), { maxRetries: 0 });
    } catch (error) {
      await executor.shutdown();
    }
    expect(isRetry).toEqual(false);
  });

  it("should clean up the agreements in the pool if the agreement has been terminated by provider", async () => {
    executor = await TaskExecutor.create({
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
        debitNoteFilter: () => false,
      },
      task: {
        maxTaskRetries: 0,
        maxParallelTasks: 2,
      },
    });

    handleEvents(executor.events, {
      market: executor.glm.market.events,
      activity: executor.glm.activity.events,
      payment: executor.glm.payment.events,
    });
    let createdAgreementsCount = 0;
    executor.glm.market.events.on("agreementApproved", () => createdAgreementsCount++);
    await executor.run(async (exe) => {
      const proc = await exe.runAndStream(
        `
      sleep 5
      echo -n 'Hello from stdout' >&1
      sleep 5
      echo -n 'Hello from stdout again' >&1
      sleep 5
      echo -n 'Hello from stdout yet again' >&1
      `,
      );
      proc.stdout.on("data", (data) => console.log(data));
      await proc.waitForExit(30_000).catch((error) => console.warn("Task execution failed:", error));
    });
    // the first task should be terminated by the provider, the second one should not use the same agreement
    await executor.run(async (exe) => console.log((await exe.run("echo 'Hello World'")).stdout));
    expect(createdAgreementsCount).toBeGreaterThan(1);
  });

  it("should only accept debit notes for agreements that were created by the executor", async () => {
    const executor1 = await TaskExecutor.create(executorOptions);
    const executor2 = await TaskExecutor.create(executorOptions);
    const confirmedAgreementsIds1 = new Set();
    const confirmedAgreementsIds2 = new Set();
    const acceptedPaymentsAgreementIds1 = new Set();
    const acceptedPaymentsAgreementIds2 = new Set();
    handleEvents(executor1.events, {
      market: executor1.glm.market.events,
      activity: executor1.glm.activity.events,
      payment: executor1.glm.payment.events,
    });
    handleEvents(executor2.events, {
      market: executor2.glm.market.events,
      activity: executor2.glm.activity.events,
      payment: executor2.glm.payment.events,
    });
    executor1.glm.market.events.on("agreementApproved", (ev) => confirmedAgreementsIds1.add(ev.agreement.id));
    executor1.glm.payment.events.on("debitNoteAccepted", (debitNote) =>
      acceptedPaymentsAgreementIds1.add(debitNote.agreementId),
    );
    executor1.glm.payment.events.on("invoiceAccepted", (invoice) =>
      acceptedPaymentsAgreementIds1.add(invoice.agreementId),
    );
    executor2.glm.market.events.on("agreementApproved", (ev) => confirmedAgreementsIds2.add(ev.agreement.id));
    executor2.glm.payment.events.on("debitNoteAccepted", (debitNote) =>
      acceptedPaymentsAgreementIds2.add(debitNote.agreementId),
    );
    executor2.glm.payment.events.on("invoiceAccepted", (invoice) =>
      acceptedPaymentsAgreementIds2.add(invoice.agreementId),
    );
    try {
      await Promise.all([
        executor1.run(async (exe) => console.log((await exe.run("echo 'Executor 1'")).stdout)),
        executor2.run(async (exe) => console.log((await exe.run("echo 'Executor 2'")).stdout)),
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
