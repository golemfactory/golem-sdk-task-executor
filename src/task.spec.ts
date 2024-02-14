import { Task, TaskState } from "./task";
import { Activity, Result, ResultState } from "@golem-sdk/golem-js";
import { instance, mock } from "@johanblumenberg/ts-mockito";

describe("Task", function () {
  const worker = async () => null;
  const activityMock = mock(Activity);
  const activity = instance(activityMock);

  it("should init task", () => {
    const task = new Task("1", worker);
    task.init();
    expect(task.getState()).toEqual(TaskState.Queued);
    task.stop();
    task.cleanup();
  });

  it("should start task", () => {
    const task = new Task("1", worker);
    task.start(activity);
    expect(task.getState()).toEqual(TaskState.Pending);
    task.stop();
    task.cleanup();
  });

  it("should complete task with results", () => {
    const task = new Task<any>("1", worker);
    task.start(activity);
    const result = new Result<null>({
      index: 0,
      eventDate: new Date().toDateString(),
      result: ResultState.Ok,
      stdout: "result",
    });
    task.stop(result);
    expect(task.getState()).toEqual(TaskState.Done);
    task.cleanup();
  });

  it("should complete task with error", () => {
    const task = new Task<any>("1", worker);
    task.start(activity);
    const error = new Error("test");
    task.stop(undefined, error, false);
    expect(task.getState()).toEqual(TaskState.Rejected);
  });

  it("should retry task", () => {
    const task = new Task<any>("1", worker);
    task.start(activity);
    const error = new Error("test");
    task.stop(undefined, error, true);
    expect(task.getState()).toEqual(TaskState.Retry);
  });
});
