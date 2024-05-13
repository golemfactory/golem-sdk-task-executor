import { Task, TaskState } from "./task";
import { LeaseProcess, Result } from "@golem-sdk/golem-js";
import { instance, mock } from "@johanblumenberg/ts-mockito";

describe("Task", function () {
  const worker = async () => null;
  const leaseProcessMock = mock(LeaseProcess);
  const leaseProcess = instance(leaseProcessMock);

  it("should init task", () => {
    const task = new Task("1", worker);
    task.init();
    expect(task.getState()).toEqual(TaskState.Queued);
    task.stop();
    task.cleanup();
  });

  it("should start task", () => {
    const task = new Task("1", worker);
    task.start(leaseProcess);
    expect(task.getState()).toEqual(TaskState.Pending);
    task.stop();
    task.cleanup();
  });

  it("should complete task with results", () => {
    const task = new Task<unknown>("1", worker);
    task.start(leaseProcess);
    const result = new Result<null>({
      index: 0,
      eventDate: new Date().toDateString(),
      result: "Ok",
      stdout: "result",
    });
    task.stop(result);
    expect(task.getState()).toEqual(TaskState.Done);
    task.cleanup();
  });

  it("should complete task with error", () => {
    const task = new Task<unknown>("1", worker);
    task.start(leaseProcess);
    const error = new Error("test");
    task.stop(undefined, error, false);
    expect(task.getState()).toEqual(TaskState.Rejected);
  });

  it("should retry task", () => {
    const task = new Task<unknown>("1", worker);
    task.start(leaseProcess);
    const error = new Error("test");
    task.stop(undefined, error, true);
    expect(task.getState()).toEqual(TaskState.Retry);
  });
});
