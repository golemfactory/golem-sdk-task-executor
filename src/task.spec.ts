import { Task, TaskState } from "./task";
import { Activity, GolemTimeoutError, Result } from "@golem-sdk/golem-js";
import { instance, mock } from "@johanblumenberg/ts-mockito";
import { sleep } from "./utils";

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
    const task = new Task<unknown>("1", worker);
    task.start(activity);
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
    task.start(activity);
    const error = new Error("test");
    task.stop(undefined, error, false);
    expect(task.getState()).toEqual(TaskState.Rejected);
  });

  it("should retry task", () => {
    const task = new Task<unknown>("1", worker);
    task.start(activity);
    const error = new Error("test");
    task.stop(undefined, error, true);
    expect(task.getState()).toEqual(TaskState.Retry);
  });

  it("should stop the task with a timeout error if the task does not complete within the specified time", async () => {
    const task = new Task<unknown>("1", worker, { timeout: 1, maxRetries: 0 });
    task.start(activity);
    await sleep(2, true);
    expect(task.getError()).toEqual(new GolemTimeoutError("Task 1 timeout."));
    expect(task.getState() === TaskState.Rejected);
  });

  it("should stop the task with a timeout error if the task does not started within the specified time", async () => {
    const task = new Task<unknown>("1", worker, { startupTimeout: 1, maxRetries: 0 });
    task.init();
    await sleep(2, true);
    expect(task.getError()).toEqual(
      new GolemTimeoutError(
        "Task startup 1 timeout. Failed to sign an agreement with the provider within the specified time",
      ),
    );
    expect(task.getState() === TaskState.Rejected);
  });
});
