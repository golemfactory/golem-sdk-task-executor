import { TaskDetails } from "./task";
import { BaseEvent } from "@golem-sdk/golem-js";

/**
 * This interface describes events emitted by `TaskExecutor` through `TaskExecutor.events` object.
 */
export interface TaskExecutorEventsDict {
  /**
   * Fires when task executor is created, before initialization services.
   */
  start: () => void;

  /**
   * Fires when task executor is initialized and ready to be used.
   */
  ready: () => void;

  /**
   * Fires when task executor is about to shut down, immediately after TaskExecutor.shutdown() is called.
   */
  beforeEnd: () => void;

  /**
   * Fires when task executor is completely terminated.
   */
  end: () => void;

  taskQueued: (task: TaskDetails) => void;
  taskStarted: (task: TaskDetails) => void;
  taskRetried: (task: TaskDetails) => void;
  taskCompleted: (task: TaskDetails) => void;
  taskFailed: (task: TaskDetails) => void;

  golemEvents: (event: BaseEvent<any>) => void;
}
