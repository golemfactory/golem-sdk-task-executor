import { Task } from "./task";
import { TaskQueue } from "./queue";
import {
  Activity,
  Agreement,
  GolemWorkError,
  ResourceRental,
  ResourceRentalPool,
  Logger,
  Result,
  ExeUnit,
  WorkErrorCode,
} from "@golem-sdk/golem-js";
import { TaskService } from "./service";
import { _, imock, instance, mock, verify, when } from "@johanblumenberg/ts-mockito";
import { EventEmitter } from "eventemitter3";
import { ExecutorEvents } from "./events";
import { sleep } from "./utils";

const testResults = new Result({ eventDate: "", index: 0, result: "Ok", stdout: "test" });

let queue: TaskQueue;
const events = new EventEmitter<ExecutorEvents>();
const testProvider = { name: "testProvider", id: "testId", walletAddress: "0x1234567" };

describe("Task Service", () => {
  const resourceRentalPoolMock = mock(ResourceRentalPool);
  const resourceRentalPool = instance(resourceRentalPoolMock);
  const resourceRentalMock = mock(ResourceRental);
  const agreementMock = mock(Agreement);
  const activityMock = mock(Activity);
  const exeUnitMock = mock(ExeUnit);
  const logger = instance(imock<Logger>());
  when(resourceRentalPoolMock.ready()).thenResolve(true);
  when(resourceRentalPoolMock.acquire(_)).thenResolve(instance(resourceRentalMock));
  when(resourceRentalMock.agreement).thenReturn(instance(agreementMock));
  when(agreementMock.provider).thenReturn(testProvider);
  when(resourceRentalMock.getExeUnit()).thenResolve(instance(exeUnitMock));
  when(resourceRentalMock.stopAndFinalize()).thenResolve();
  when(exeUnitMock.run(_)).thenCall(async () => {
    await sleep(100, true);
    return testResults;
  });
  when(exeUnitMock.provider).thenReturn(testProvider);
  when(exeUnitMock.activity).thenReturn(instance(activityMock));
  when(activityMock.id).thenReturn("test-activity-id");
  when(agreementMock.id).thenReturn("test-agreement-id");

  beforeEach(() => {
    queue = new TaskQueue();
    jest.clearAllMocks();
  });
  it("should process new task in queue", async () => {
    const taskFunction = async (exe: ExeUnit) => exe.run("some_shell_command");
    const task = new Task("1", taskFunction);
    queue.addToEnd(task);
    const cb = jest.fn();
    events.on("taskStarted", cb);
    events.on("taskCompleted", cb);
    const service = new TaskService(queue, resourceRentalPool, events, logger, {
      taskRunningIntervalMs: 10,
      maxParallelTasks: 1,
    });
    service.run().catch((e) => console.error(e));
    await sleep(200, true);
    expect(task.isFinished()).toEqual(true);
    expect(task.getResults()?.stdout).toEqual("test");
    expect(cb).toHaveBeenNthCalledWith(2, task.getDetails());
    await service.end();
    verify(resourceRentalPoolMock.release(_)).once();
  });

  it("process only allowed number of tasks simultaneously", async () => {
    const taskFunction = async (exe: ExeUnit) => exe.run("some_shell_command");
    const task1 = new Task("1", taskFunction);
    const task2 = new Task("2", taskFunction);
    const task3 = new Task("3", taskFunction);
    queue.addToEnd(task1);
    queue.addToEnd(task2);
    queue.addToEnd(task3);
    const service = new TaskService(queue, resourceRentalPool, events, logger, {
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
    const taskFunction = async (exe: ExeUnit) => exe.run("some_shell_command");
    const task = new Task("1", taskFunction, { maxRetries: 3 });
    queue.addToEnd(task);
    const cb = jest.fn();
    events.on("taskRetried", cb);
    when(exeUnitMock.run(_)).thenReject(new GolemWorkError("Test error", WorkErrorCode.ScriptExecutionFailed));
    const service = new TaskService(queue, resourceRentalPool, events, logger, {
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
    const taskFunction = async (exe: ExeUnit) => exe.run("some_shell_command");
    const task = new Task("1", taskFunction, { maxRetries: 0 });
    queue.addToEnd(task);
    when(exeUnitMock.run(_)).thenReject(new Error("Test error"));
    const service = new TaskService(queue, resourceRentalPool, events, logger, {
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
    const taskFunction = async () => Promise.resolve(true);
    expect(() => new Task("1", taskFunction, { maxRetries: -1 })).toThrow(
      "The maxRetries parameter cannot be less than zero",
    );
  });

  it("should reject task if it failed max attempts", async () => {
    const taskFunction = async (exe: ExeUnit) => exe.run("some_shell_command");
    const task = new Task("1", taskFunction, { maxRetries: 1 });
    const cb = jest.fn();
    events.on("taskRetried", cb);
    when(exeUnitMock.run(_)).thenReject(new GolemWorkError("Test error", WorkErrorCode.ScriptExecutionFailed));
    const service = new TaskService(queue, resourceRentalPool, events, logger, {
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
});
