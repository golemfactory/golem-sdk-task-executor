import { readFileSync } from "fs";
import { EVENT_TYPE, BaseEvent, Events } from "@golem-sdk/golem-js";
import { TaskExecutor } from "../../src";
import { sleep } from "../../src/utils";

describe("Task Executor", function () {
  let executor: TaskExecutor;
  let emittedEventsNames: string[] = [];

  const verifyAllExpectedEventsEmitted = () => {
    expect(emittedEventsNames).toContain(Events.ProposalReceived.name);
    expect(emittedEventsNames).toContain(Events.ProposalConfirmed.name);
    expect(emittedEventsNames).toContain(Events.ProposalResponded.name);
    expect(emittedEventsNames).toContain(Events.AgreementCreated.name);
    expect(emittedEventsNames).toContain(Events.ActivityCreated.name);
    expect(emittedEventsNames).toContain(Events.ActivityDestroyed.name);
    expect(emittedEventsNames).toContain(Events.AgreementTerminated.name);
    expect(emittedEventsNames).toContain(Events.InvoiceReceived.name);
    expect(emittedEventsNames).toContain(Events.DebitNoteReceived.name);
    expect(emittedEventsNames).toContain(Events.PaymentAccepted.name);
    expect(emittedEventsNames).toContain(Events.DebitNoteAccepted.name);
  };

  beforeEach(() => {
    emittedEventsNames = [];
  });

  afterEach(async function () {
    await executor?.shutdown();
  });

  it("should run simple task", async () => {
    executor = await TaskExecutor.create("golem/alpine:latest");
    executor.events.on("golemEvents", (event) => emittedEventsNames.push(event.name));

    const result = await executor.run(async (ctx) => ctx.run("echo 'Hello World'"));

    expect(result?.stdout).toContain("Hello World");
    verifyAllExpectedEventsEmitted();
  });

  it("should run simple task and get error for invalid command", async () => {
    executor = await TaskExecutor.create("golem/alpine:latest");
    executor.events.on("golemEvents", (event) => emittedEventsNames.push(event.name));

    const result1 = await executor.run(async (ctx) => ctx.run("echo 'Hello World'"));
    const result2 = await executor.run(async (ctx) => ctx.run("invalid-command"));

    expect(result1?.stdout).toContain("Hello World");
    expect(result2?.result).toEqual("Error");
    expect(result2?.stderr).toContain("sh: invalid-command: not found");
    expect(result2?.message).toEqual("ExeScript command exited with code 127");
    verifyAllExpectedEventsEmitted();
  });

  it("should run simple task using package tag", async () => {
    executor = await TaskExecutor.create("golem/alpine:latest");
    executor.events.on("golemEvents", (event) => emittedEventsNames.push(event.name));

    const result = await executor.run(async (ctx) => ctx.run("echo 'Hello World'"));

    expect(result?.stdout).toContain("Hello World");
    verifyAllExpectedEventsEmitted();
  });

  it("should run simple tasks by map function", async () => {
    executor = await TaskExecutor.create("golem/alpine:latest");
    executor.events.on("golemEvents", (event) => emittedEventsNames.push(event.name));
    const data = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
    const futureResults = data.map((x) =>
      executor.run(async (ctx) => {
        const res = await ctx.run(`echo "${x}"`);
        return res.stdout?.toString().trim();
      }),
    );
    const finalOutputs = (await Promise.all(futureResults)).filter((x) => !!x);
    expect(finalOutputs).toEqual(expect.arrayContaining(data));
    verifyAllExpectedEventsEmitted();
  });

  it("should run simple batch script and get results as stream", async () => {
    executor = await TaskExecutor.create("golem/alpine:latest");
    executor.events.on("golemEvents", (event) => emittedEventsNames.push(event.name));
    let taskDetails;
    executor.events.on("taskCompleted", (event) => (taskDetails = event));
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
    expect(taskDetails).toEqual({ taskId: "1", providerName: expect.anything(), retries: expect.anything() });
    expect(outputs[0]).toEqual("Hello Golem");
    expect(outputs[1]).toEqual("Hello World");
    expect(outputs[2]).toEqual("OK");
    expect(onEnd).toEqual("END");
    verifyAllExpectedEventsEmitted();
  });

  it("should run simple batch script and get results as promise", async () => {
    executor = await TaskExecutor.create("golem/alpine:latest");
    executor.events.on("golemEvents", (event) => emittedEventsNames.push(event.name));
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
    verifyAllExpectedEventsEmitted();
  });

  it("should run transfer file", async () => {
    executor = await TaskExecutor.create("golem/alpine:latest");
    executor.events.on("golemEvents", (event) => emittedEventsNames.push(event.name));

    const result = await executor.run(async (ctx) => {
      await ctx.uploadJson({ test: "1234" }, "/golem/work/test.json");
      const res = await ctx.downloadFile("/golem/work/test.json", "new_test.json");
      return res?.result;
    });

    expect(result).toEqual("Ok");
    expect(readFileSync(`new_test.json`, "utf-8")).toEqual('{"test":"1234"}');
    verifyAllExpectedEventsEmitted();
  });

  it("should run transfer file via http", async () => {
    executor = await TaskExecutor.create("golem/alpine:latest");
    executor.events.on("golemEvents", (event) => emittedEventsNames.push(event.name));

    const result = await executor.run(async (ctx) => {
      const res = await ctx.transfer(
        "http://registry.golem.network/download/a2bb9119476179fac36149723c3ad4474d8d135e8d2d2308eb79907a6fc74dfa",
        "/golem/work/alpine.gvmi",
      );
      return res.result;
    });
    expect(result).toEqual("Ok");
    verifyAllExpectedEventsEmitted();
  });

  it("should get ip address", async () => {
    executor = await TaskExecutor.create({
      package: "golem/alpine:latest",
      capabilities: ["vpn"],
      networkIp: "192.168.0.0/24",
    });
    const result = await executor.run(async (ctx) => ctx.getIp());
    expect(["192.168.0.2", "192.168.0.3"]).toContain(result);
  });

  it("should spawn command as external process", async () => {
    executor = await TaskExecutor.create("golem/alpine:latest");
    executor.events.on("golemEvents", (event) => emittedEventsNames.push(event.name));
    let stdout = "";
    let stderr = "";
    const finalResult = await executor.run(async (ctx) => {
      const remoteProcess = await ctx.spawn("sleep 1 && echo 'Hello World' && echo 'Hello Golem' >&2");
      remoteProcess.stdout.on("data", (data) => (stdout += data.trim()));
      remoteProcess.stderr.on("data", (data) => (stderr += data.trim()));
      return remoteProcess.waitForExit();
    });
    expect(stdout).toContain("Hello World");
    expect(stderr).toContain("Hello Golem");
    expect(finalResult?.result).toContain("Ok");
    verifyAllExpectedEventsEmitted();
  });

  it("should not retry the task if maxTaskRetries is zero", async () => {
    executor = await TaskExecutor.create({
      package: "golem/alpine:latest",
      maxTaskRetries: 0,
    });
    let isRetry = false;
    executor.events.on("taskRetried", () => (isRetry = true));
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
      package: "golem/alpine:latest",
      maxTaskRetries: 7,
    });
    let isRetry = false;
    executor.events.on("taskRetried", () => (isRetry = true));
    try {
      executor.onActivityReady(async (ctx) => Promise.reject("Error"));
      await executor.run(async (ctx) => console.log((await ctx.run("echo 'Hello World'")).stdout), { maxRetries: 0 });
    } catch (error) {
      await executor.shutdown();
    }
    expect(isRetry).toEqual(false);
  });

  it("should clean up the agreements in the pool if the agreement has been terminated by provider", async () => {
    const eventTarget = new EventTarget();
    const executor = await TaskExecutor.create({
      package: "golem/alpine:latest",
      eventTarget,
      // we set mid-agreement payment and a filter that will not pay for debit notes
      // which should result in termination of the agreement by provider
      debitNotesFilter: () => Promise.resolve(false),
      debitNotesAcceptanceTimeoutSec: 10,
      midAgreementPaymentTimeoutSec: 10,
      midAgreementDebitNoteIntervalSec: 10,
    });
    let createdAgreementsCount = 0;
    eventTarget.addEventListener(EVENT_TYPE, (event) => {
      const ev = event as BaseEvent<unknown>;
      if (ev instanceof Events.AgreementCreated) createdAgreementsCount++;
    });
    try {
      await executor.run(async (ctx) => {
        const proc = await ctx.spawn("timeout 15 ping 127.0.0.1");
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

  it("should only accept debit notes for agreements that were created by the executor", async () => {
    const eventTarget1 = new EventTarget();
    const eventTarget2 = new EventTarget();
    const executor1 = await TaskExecutor.create("golem/alpine:latest");
    const executor2 = await TaskExecutor.create("golem/alpine:latest");
    const createdAgreementsIds1 = new Set();
    const createdAgreementsIds2 = new Set();
    const acceptedDebitNoteAgreementIds1 = new Set();
    const acceptedDebitNoteAgreementIds2 = new Set();
    eventTarget1.addEventListener(EVENT_TYPE, (event) => {
      const ev = event as BaseEvent<unknown>;
      if (ev instanceof Events.AgreementCreated) createdAgreementsIds1.add(ev.detail.id);
      if (ev instanceof Events.DebitNoteAccepted) acceptedDebitNoteAgreementIds1.add(ev.detail.agreementId);
    });
    eventTarget2.addEventListener(EVENT_TYPE, (event) => {
      const ev = event as BaseEvent<unknown>;
      if (ev instanceof Events.AgreementCreated) createdAgreementsIds2.add(ev.detail.id);
      if (ev instanceof Events.DebitNoteAccepted) acceptedDebitNoteAgreementIds2.add(ev.detail.agreementId);
    });
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
    expect(acceptedDebitNoteAgreementIds1).toEqual(createdAgreementsIds1);
    expect(acceptedDebitNoteAgreementIds2).toEqual(createdAgreementsIds2);
  });
});
