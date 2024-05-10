import { TaskQueue } from "./queue";
import { Task } from "./task";
import { instance, mock, reset, when } from "@johanblumenberg/ts-mockito";

describe("Task Queue", function () {
  let testQueue: TaskQueue<Task>;
  const taskMock = mock(Task);
  const testWorker = async () => null;
  beforeEach(function () {
    testQueue = new TaskQueue<Task>();
    reset(taskMock);
    when(taskMock.isQueueable()).thenReturn(true);
  });
  describe("Adding", () => {
    it("should allow to add Task to the queue", () => {
      const task = new Task("1", testWorker);
      testQueue.addToEnd(task);
      expect(testQueue.size).toEqual(1);
    });
    it("should add new task on the end of the queue", () => {
      const tasksToAdd = ["A", "B", "C"].map((id) => new Task(id, testWorker));
      // Add tree different tasks to the queue
      tasksToAdd.forEach((task) => testQueue.addToEnd(task));
      // Check if the order is the same
      tasksToAdd.forEach((task) => {
        const returnedTask = testQueue.get();
        expect(returnedTask).toEqual(task);
      });
    });
    it("should add task on the beginning of the queue", () => {
      const tasksToAdd = ["A", "B", "C"].map((id) => new Task(id, testWorker));
      // Add tree different tasks to the queue
      tasksToAdd.forEach((task) => testQueue.addToBegin(task));
      // Reverse expectation and check
      tasksToAdd.reverse().forEach((task) => {
        const returnedTask = testQueue.get();
        expect(returnedTask).toEqual(task);
      });
    });
    it("should throws error if adding pending task", () => {
      const task = instance(taskMock);
      when(taskMock.isQueueable()).thenReturn(false);
      expect(() => testQueue.addToEnd(task)).toThrow("You cannot add a task that is not in the correct state");
    });
    it("should throws error if adding an existing task", () => {
      const task = new Task("A", testWorker);
      testQueue.addToEnd(task);
      expect(() => testQueue.addToEnd(task)).toThrow("Task A has already been added to the queue");
    });
  });

  describe("Getting", () => {
    it("should remove task form the queue", () => {
      const task = instance(taskMock);
      testQueue.addToEnd(task);
      expect(testQueue.size).toEqual(1);
      testQueue.get();
      expect(testQueue.size).toEqual(0);
    });

    it('should return "undefined" when the queue is empty', () => {
      expect(testQueue.size).toEqual(0);
      expect(testQueue.get()).toBeUndefined();
    });

    it("should return correct number of items in the queue ", () => {
      // Add 3 tasks to the queue
      testQueue.addToEnd(new Task("1", testWorker));
      testQueue.addToEnd(new Task("2", testWorker));
      testQueue.addToEnd(new Task("3", testWorker));
      // Check if is eq 3
      expect(testQueue.size).toEqual(3);
      // Get one
      testQueue.get();
      // Check if is eq 2
      expect(testQueue.size).toEqual(2);
      // Get next two
      testQueue.get();
      testQueue.get();
      // Check if is eq 0
      expect(testQueue.size).toEqual(0);
      // get another one (not existing)
      testQueue.get();
      // Check if still is eq 0
      expect(testQueue.size).toEqual(0);
    });

    it("should check if task belongs to the queue", () => {
      const task = instance(taskMock);
      testQueue.addToEnd(task);
      expect(testQueue.has(task)).toEqual(true);
    });
  });
});
