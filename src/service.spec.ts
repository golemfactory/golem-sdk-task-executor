import { Task } from "./task";
import { TaskQueue } from "./queue";
import {
  Activity,
  Agreement,
  GolemWorkError,
  LeaseProcess,
  LeaseProcessPool,
  Logger,
  Result,
  WorkContext,
  WorkErrorCode,
} from "@golem-sdk/golem-js";
import { TaskService } from "./service";
import { anything, imock, instance, mock, spy, verify, when } from "@johanblumenberg/ts-mockito";
import { EventEmitter } from "eventemitter3";
import { TaskEvents } from "./events";
import { sleep } from "./utils";

const testResults = new Result({ eventDate: "", index: 0, result: "Ok", stdout: "test" });

let queue: TaskQueue;
const events = new EventEmitter<TaskEvents>();
const testProvider = { name: "testProvider", id: "testId", walletAddress: "0x1234567" };

describe("Task Service", () => {
  const leaseProcessPoolMock = mock(LeaseProcessPool);
  const leaseProcessPool = instance(leaseProcessPoolMock);
  const leaseProcessMock = mock(LeaseProcess);
  const agreementMock = mock(Agreement);
  const activityMock = mock(Activity);
  const workContextMock = mock(WorkContext);
  const logger = instance(imock<Logger>());
  when(leaseProcessPoolMock.ready()).thenResolve(true);
  when(leaseProcessPoolMock.acquire()).thenResolve(instance(leaseProcessMock));
  when(leaseProcessMock.agreement).thenReturn(instance(agreementMock));
  when(agreementMock.getProviderInfo()).thenReturn(testProvider);
  when(leaseProcessMock.getExeUnit()).thenResolve(instance(workContextMock));
  when(leaseProcessMock.finalize()).thenResolve();
  when(workContextMock.run(anything())).thenCall(async () => {
    await sleep(100, true);
    return testResults;
  });
  when(workContextMock.provider).thenReturn(testProvider);
  when(workContextMock.activity).thenReturn(instance(activityMock));
  when(activityMock.id).thenReturn("test-activity-id");
  when(agreementMock.id).thenReturn("test-agreement-id");

  beforeEach(() => {
    queue = new TaskQueue();
    jest.clearAllMocks();
  });
  it("should process new task in queue", async () => {
    const worker = async (ctx: WorkContext) => ctx.run("some_shell_command");
    const task = new Task("1", worker);
    queue.addToEnd(task);
    const cb = jest.fn();
    events.on("taskStarted", cb);
    events.on("taskCompleted", cb);
    const service = new TaskService(queue, leaseProcessPool, events, logger, {
      taskRunningIntervalMs: 10,
      maxParallelTasks: 1,
    });
    service.run().catch((e) => console.error(e));
    await sleep(200, true);
    expect(task.isFinished()).toEqual(true);
    expect(task.getResults()?.stdout).toEqual("test");
    expect(cb).toHaveBeenNthCalledWith(2, task.getDetails());
    await service.end();
    verify(leaseProcessPoolMock.release(anything())).once();
  });

  it("process only allowed number of tasks simultaneously", async () => {
    const worker = async (ctx: WorkContext) => ctx.run("some_shell_command");
    const task1 = new Task("1", worker);
    const task2 = new Task("2", worker);
    const task3 = new Task("3", worker);
    queue.addToEnd(task1);
    queue.addToEnd(task2);
    queue.addToEnd(task3);
    const service = new TaskService(queue, leaseProcessPool, events, logger, {
      taskRunningIntervalMs: 1,
      maxParallelTasks: 2,
    });
    service.run().catch((e) => console.error(e));
    await sleep(20, true);
    expect(task1.isNew()).toEqual(false);
    expect(task2.isNew()).toEqual(false);
    expect(task3.isNew()).toEqual(true);
    await service.end();
  });

  it("should retry task if it failed", async () => {
    const worker = async (ctx: WorkContext) => ctx.run("some_shell_command");
    const task = new Task("1", worker, { maxRetries: 3 });
    queue.addToEnd(task);
    const cb = jest.fn();
    events.on("taskRetried", cb);
    when(workContextMock.run(anything())).thenReject(
      new GolemWorkError("Test error", WorkErrorCode.ScriptExecutionFailed),
    );
    const service = new TaskService(queue, leaseProcessPool, events, logger, {
      taskRunningIntervalMs: 10,
      maxParallelTasks: 1,
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
    when(workContextMock.run(anything())).thenReject(new Error("Test error"));
    const service = new TaskService(queue, leaseProcessPool, events, logger, {
      taskRunningIntervalMs: 10,
      maxParallelTasks: 1,
    });
    service.run().catch((e) => console.error(e));
    await sleep(200, true);
    expect(task.isRetry()).toEqual(false);
    expect(task.isRejected()).toEqual(true);
    await service.end();
  });

  it("should throw an error if maxRetries is less then zero", async () => {
    const worker = async () => Promise.resolve(true);
    expect(() => new Task("1", worker, { maxRetries: -1 })).toThrow(
      "The maxRetries parameter cannot be less than zero",
    );
  });

  it("should reject task if it failed max attempts", async () => {
    const worker = async (ctx: WorkContext) => ctx.run("some_shell_command");
    const task = new Task("1", worker, { maxRetries: 1 });
    const cb = jest.fn();
    events.on("taskRetried", cb);
    when(workContextMock.run(anything())).thenReject(
      new GolemWorkError("Test error", WorkErrorCode.ScriptExecutionFailed),
    );
    const service = new TaskService(queue, leaseProcessPool, events, logger, {
      taskRunningIntervalMs: 10,
      maxParallelTasks: 1,
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
    const service = new TaskService(queue, leaseProcessPool, events, logger, {
      taskRunningIntervalMs: 10,
      maxParallelTasks: 2,
    });
    const activitySetupDoneSpy = spy(service["activitySetupDone"]);
    when(workContextMock.run(anything())).thenResolve(testResults);
    service.run().then();
    await sleep(500, true);
    verify(activitySetupDoneSpy.add(anything())).times(3);
    expect(task1.isFinished()).toEqual(true);
    expect(task2.isFinished()).toEqual(true);
    expect(task3.isFinished()).toEqual(true);
    await service.end();
  });
});
