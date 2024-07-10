import { Task, TaskState } from "./task";
import { ResourceRental, GolemTimeoutError, Result, ExeUnit } from "@golem-sdk/golem-js";
import { instance, mock } from "@johanblumenberg/ts-mockito";
import { sleep } from "./utils";

describe("Task", function () {
  const taskFunction = async () => null;
  const resourceRentalMock = mock(ResourceRental);
  const resourceRental = instance(resourceRentalMock);
  const exe = instance(mock(ExeUnit));

  it("should init task", () => {
    const task = new Task("1", taskFunction);
    task.init();
    expect(task.getState()).toEqual(TaskState.Queued);
    task.stop();
    task.cleanup();
  });

  it("should start task", () => {
    const task = new Task("1", taskFunction);
    task.init();
    task.start(resourceRental, exe);
    expect(task.getState()).toEqual(TaskState.Pending);
    task.stop();
    task.cleanup();
  });

  it("should not start task that is not queued", () => {
    const task = new Task("1", taskFunction);
    expect(() => task.start(resourceRental, exe)).toThrow("You cannot start a task that is not queued");
  });

  it("should complete task with results", () => {
    const task = new Task<unknown>("1", taskFunction);
    task.init();
    task.start(resourceRental, exe);
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
    const task = new Task<unknown>("1", taskFunction);
    task.init();
    task.start(resourceRental, exe);
    const error = new Error("test");
    task.stop(undefined, error, false);
    expect(task.getState()).toEqual(TaskState.Rejected);
  });

  it("should retry task", () => {
    const task = new Task<unknown>("1", taskFunction);
    task.init();
    task.start(resourceRental, exe);
    const error = new Error("test");
    task.stop(undefined, error, true);
    expect(task.getState()).toEqual(TaskState.Retry);
  });

  describe("task execution timeout", () => {
    it("should stop the task with a timeout error if the task does not complete within the specified time", async () => {
      const task = new Task<unknown>("1", taskFunction, { timeout: 1, maxRetries: 0 });
      task.init();
      task.start(resourceRental, exe);
      await sleep(2, true);
      expect(task.getError()).toEqual(new GolemTimeoutError("Task 1 timeout."));
      expect(task.getState() === TaskState.Rejected);
    });

    it("should retry the task if the retryOnTimeout is set to 'true'", async () => {
      const task = new Task<unknown>("1", taskFunction, { timeout: 1, maxRetries: 1, retryOnTimeout: true });
      task.init();
      task.start(resourceRental, exe);
      await sleep(2, true);
      expect(task.getError()).toEqual(new GolemTimeoutError("Task 1 timeout."));
      expect(task.getState() === TaskState.Retry);
    });
  });

  describe("task startup timeout", () => {
    it("should stop the task with a timeout error if the task does not started within the specified time", async () => {
      const task = new Task<unknown>("1", taskFunction, { startupTimeout: 1, maxRetries: 0 });
      task.init();
      await sleep(2, true);
      expect(task.getError()).toEqual(
        new GolemTimeoutError(
          "Task 1 startup timeout. Failed to prepare the runtime environment within the specified time.",
        ),
      );
      expect(task.getState() === TaskState.Rejected);
    });

    it("should retry the task if the retryOnTimeout is set to 'true'", async () => {
      const task = new Task<unknown>("1", taskFunction, { startupTimeout: 1, maxRetries: 1, retryOnTimeout: true });
      task.init();
      await sleep(2, true);
      expect(task.getError()).toEqual(
        new GolemTimeoutError(
          "Task 1 startup timeout. Failed to prepare the runtime environment within the specified time.",
        ),
      );
      expect(task.getState() === TaskState.Retry);
    });
  });
});
