import { TaskQueue } from "./queue";
import { Task } from "./task";
import { instance, mock, reset, when } from "@johanblumenberg/ts-mockito";

describe("Task Queue", function () {
  let testQueue: TaskQueue<Task>;
  const taskMock = mock(Task);
  beforeEach(function () {
    testQueue = new TaskQueue<Task>();
    reset(taskMock);
    when(taskMock.isQueueable()).thenReturn(true);
  });
  describe("Adding", () => {
    it("should allow to add Task to the queue", () => {
      const task = instance(taskMock);
      testQueue.addToEnd(task);
      expect(testQueue.size).toEqual(1);
    });
    it("should add new task on the end of the queue", () => {
      const tasksToAdd = ["A", "B", "C"].map(() => instance(taskMock));
      // Add tree different tasks to the queue
      tasksToAdd.forEach((task) => testQueue.addToEnd(task));
      // Check if the order is the same
      tasksToAdd.forEach((task) => {
        const returnedTask = testQueue.get();
        expect(returnedTask).toEqual(task);
      });
    });
    it("should add task on the beginning of the queue", () => {
      const tasksToAdd = ["A", "B", "C"].map(() => instance(taskMock));
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
      testQueue.addToEnd(instance(taskMock));
      testQueue.addToEnd(instance(taskMock));
      testQueue.addToEnd(instance(taskMock));
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
  });
});
