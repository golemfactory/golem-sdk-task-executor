import { TaskDetails } from "./task";
import { BaseEvent } from "@golem-sdk/golem-js";

/**
 * This interface describes events emitted by `TaskExecutor` through `TaskExecutor.events` object.
 */
export interface TaskExecutorEventsDict {
  /**
   * Fires when task executor is created, before initialization services.
   */
  start: (ev: Event) => void;

  /**
   * Fires when task executor is initialized and ready to be used.
   */
  ready: (ev: Event) => void;

  /**
   * Fires when task executor is about to shut down, immediately after TaskExecutor.shutdown() is called.
   */
  beforeEnd: (ev: Event) => void;

  /**
   * Fires when task executor is completely terminated.
   */
  end: (ev: Event) => void;

  /**
   * Fires when a task is placed in the internal queue via {@link TaskExecutor.run}
   *
   * @param task
   */
  taskQueued: (task: TaskDetails) => void;

  /**
   * Fires when the task gets picked up from the internal queue and is getting executed
   *
   * @param task
   */
  taskStarted: (task: TaskDetails) => void;

  /**
   * Fires when the task had to be re-tried due to an error check - {@link TaskDetails.error} for details of the issue
   *
   * @param task
   */
  taskRetried: (task: TaskDetails) => void;

  /**
   * Fires when a task is successfully completed
   *
   * @param task
   */
  taskCompleted: (task: TaskDetails) => void;

  /**
   * Fires when a task has failed and won't be re-tried any longer
   *
   * @param task
   */
  taskFailed: (task: TaskDetails) => void;

  /**
   * Exposes internal @golem-sdk/golem-js events
   *
   * @deprecated This options is deprecated and will be removed. Alternative ways to reach these events will be provided.
   *
   * @param event
   */
  golemEvents: (event: BaseEvent<unknown>) => void;
}
