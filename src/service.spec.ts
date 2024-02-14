import { Task } from "./task";
import { TaskQueue } from "./queue";
import {
  Activity,
  ActivityStateEnum,
  Agreement,
  AgreementPoolService,
  NetworkService,
  PaymentService,
  Result,
  ResultState,
  WorkContext,
  YagnaApi,
} from "@golem-sdk/golem-js";
import { TaskService } from "./service";
import { anything, imock, instance, mock, spy, verify, when, reset } from "@johanblumenberg/ts-mockito";
import { EventEmitter } from "eventemitter3";
import { TaskExecutorEventsDict } from "./events";
import { Readable } from "node:stream";
import { sleep } from "./utils";

let queue: TaskQueue;
const paymentServiceMock = mock(PaymentService);
const agreementPoolServiceMock = mock(AgreementPoolService);
const networkServiceMock = mock(NetworkService);
const paymentService = instance(paymentServiceMock);
const agreementPoolService = instance(agreementPoolServiceMock);
const networkService = instance(networkServiceMock);
const yagnaApiMock = imock<YagnaApi>();
const yagnaApi = instance(yagnaApiMock);
const events = new EventEmitter<TaskExecutorEventsDict>();
const agreementMock = mock(Agreement);
const activityMock = mock(Activity);
const agreement = instance(agreementMock);
const activity = instance(activityMock);
when(agreementPoolServiceMock.getAgreement()).thenResolve(agreement);
when(agreementPoolServiceMock.releaseAgreement(anything(), anything())).thenResolve();
when(activityMock.agreement).thenReturn(agreement);
when(activityMock.getState()).thenResolve(ActivityStateEnum.Ready);
when(activityMock.stop()).thenResolve(true);
const providerInfo = { name: "testProvider", id: "testId", walletAddress: "0x1234567" };
when(agreementMock.getProviderInfo()).thenReturn(providerInfo);
Activity.create = jest.fn(() => Promise.resolve(activity));

describe("Task Service", () => {
  beforeEach(() => {
    queue = new TaskQueue();
    const results = [
      new Result({ index: 0, result: ResultState.Ok, stdout: "test", eventDate: new Date().toDateString() }),
    ];
    const readable = new Readable({
      objectMode: true,
      read(size: number) {
        readable.push(results.shift() ?? null);
      },
    });
    when(activityMock.execute(anything(), false, undefined)).thenResolve(readable);
  });
  it("should process new task in queue", async () => {
    const worker = async (ctx: WorkContext) => ctx.run("some_shell_command");
    const task = new Task("1", worker);
    queue.addToEnd(task);
    const cb = jest.fn();
    events.on("taskStarted", cb);
    events.on("taskCompleted", cb);
    const service = new TaskService(yagnaApi, queue, events, agreementPoolService, paymentService, networkService, {
      taskRunningInterval: 10,
      activityStateCheckingInterval: 10,
    });
    service.run().catch((e) => console.error(e));
    await sleep(200, true);
    expect(task.isFinished()).toEqual(true);
    expect(task.getResults()?.stdout).toEqual("test");
    expect(cb).toHaveBeenNthCalledWith(2, task.getDetails());
    await service.end();
    verify(activityMock.stop()).once();
    verify(agreementPoolServiceMock.releaseAgreement(agreement.id, true)).once();
  });

  it("process only allowed number of tasks simultaneously", async () => {
    const worker = async (ctx: WorkContext) => ctx.run("some_shell_command");
    const task1 = new Task("1", worker);
    const task2 = new Task("2", worker);
    const task3 = new Task("3", worker);
    queue.addToEnd(task1);
    queue.addToEnd(task2);
    queue.addToEnd(task3);
    const service = new TaskService(yagnaApi, queue, events, agreementPoolService, paymentService, networkService, {
      taskRunningInterval: 10,
      activityStateCheckingInterval: 10,
      maxParallelTasks: 2,
    });
    service.run().catch((e) => console.error(e));
    expect(task1.isQueued()).toEqual(true);
    expect(task2.isQueued()).toEqual(true);
    expect(task3.isQueued()).toEqual(false);
    expect(task3.isNew()).toEqual(true);
    await service.end();
  });

  it("should retry task if it failed", async () => {
    const worker = async (ctx: WorkContext) => ctx.run("some_shell_command");
    const task = new Task("1", worker, { maxRetries: 3 });
    queue.addToEnd(task);
    const readable = new Readable({
      objectMode: true,
      read(size: number) {
        readable.destroy(new Error("Test error"));
      },
    });
    const cb = jest.fn();
    events.on("taskRetried", cb);
    when(activityMock.execute(anything(), false, undefined)).thenReject(new Error("Test error"));
    const service = new TaskService(yagnaApi, queue, events, agreementPoolService, paymentService, networkService, {
      taskRunningInterval: 10,
      activityStateCheckingInterval: 10,
    });
    service.run().then();
    await sleep(500, true);
    expect(cb).toHaveBeenCalledTimes(3);
    expect(task.isRejected()).toEqual(true);
    await service.end();
  });

  it("should not retry task if it failed and maxRetries is zero", async () => {
    const worker = async (ctx: WorkContext) => ctx.run("some_shell_command");
    const task = new Task("1", worker, { maxRetries: 0 });
    queue.addToEnd(task);
    when(activityMock.execute(anything(), false, undefined)).thenReject(new Error("Test error"));
    const service = new TaskService(yagnaApi, queue, events, agreementPoolService, paymentService, networkService, {
      taskRunningInterval: 10,
      activityStateCheckingInterval: 10,
    });
    service.run().catch((e) => console.error(e));
    await sleep(200, true);
    expect(task.isRetry()).toEqual(false);
    expect(task.isRejected()).toEqual(true);
    await service.end();
  });

  it("should throw an error if maxRetries is less then zero", async () => {
    const worker = async (ctx: WorkContext) => Promise.resolve(true);
    expect(() => new Task("1", worker, { maxRetries: -1 })).toThrow(
      "The maxRetries parameter cannot be less than zero",
    );
  });

  it("should reject task if it failed max attempts", async () => {
    const worker = async (ctx: WorkContext) => ctx.run("some_shell_command");
    const task = new Task("1", worker, { maxRetries: 1 });
    const cb = jest.fn();
    events.on("taskRetried", cb);
    when(activityMock.execute(anything(), false, undefined)).thenReject(new Error("Test error"));
    const service = new TaskService(yagnaApi, queue, events, agreementPoolService, paymentService, networkService, {
      taskRunningInterval: 10,
      activityStateCheckingInterval: 10,
    });
    queue.addToEnd(task);
    service.run().catch((e) => console.error(e));
    await sleep(500, true);
    expect(task.isRejected()).toEqual(true);
    expect(cb).toHaveBeenCalledWith(task.getDetails());
    await service.end();
  });

  it("should run setup functions on each activity", async () => {
    let i = 1;
    when(activityMock.id).thenCall(() => (++i).toString());
    const setupFunctions = [async (ctx: WorkContext) => ctx.run("init_shell_command")];
    const worker = async (ctx: WorkContext) => ctx.run("some_shell_command");
    const task1 = new Task("1", worker, { activityReadySetupFunctions: setupFunctions });
    const task2 = new Task("2", worker, { activityReadySetupFunctions: setupFunctions });
    const task3 = new Task("3", worker, { activityReadySetupFunctions: setupFunctions });
    queue.addToEnd(task1);
    queue.addToEnd(task2);
    queue.addToEnd(task3);
    const service = new TaskService(yagnaApi, queue, events, agreementPoolService, paymentService, networkService, {
      taskRunningInterval: 10,
      activityStateCheckingInterval: 10,
      maxParallelTasks: 2,
    });
    const activitySetupDoneSpy = spy(service["activitySetupDone"]);
    service.run().then();
    await sleep(500, true);
    verify(activitySetupDoneSpy.add(anything())).times(3);
    expect(task1.isFinished()).toEqual(true);
    expect(task2.isFinished()).toEqual(true);
    expect(task3.isFinished()).toEqual(true);
    await service.end();
  });
});
