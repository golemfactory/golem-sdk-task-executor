import { Task } from "./task";
import { GolemInternalError } from "@golem-sdk/golem-js";

/**
 * @internal
 */
export interface QueueableTask {
  id: string;
  isQueueable(): boolean;
}

/**
 * @internal
 */
export class TaskQueue<T extends QueueableTask = Task> {
  protected itemsStack: Array<T> = [];

  addToEnd(task: T) {
    this.checkIfTaskIsEligibleForAdd(task);
    this.itemsStack.push(task);
  }

  addToBegin(task: T) {
    this.checkIfTaskIsEligibleForAdd(task);
    this.itemsStack.unshift(task);
  }

  get size(): number {
    return this.itemsStack.length;
  }

  get(): T | undefined {
    return this.itemsStack.shift();
  }

  has(task: T) {
    return this.itemsStack.some((t) => t.id === task.id);
  }

  private checkIfTaskIsEligibleForAdd(task: T) {
    if (!task.isQueueable()) {
      throw new GolemInternalError("You cannot add a task that is not in the correct state");
    }
    if (this.has(task)) {
      throw new GolemInternalError(`Task ${task.id} has already been added to the queue`);
    }
  }
}
