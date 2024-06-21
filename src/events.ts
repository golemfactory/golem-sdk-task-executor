import { TaskDetails } from "./task";

/**
 * This interface describes events emitted by `TaskExecutor` through `TaskExecutor.events` object.
 */
export interface ExecutorEvents {
  /**
   * Fires when task executor is created, before initialization services.
   */
  executorStart: (timestamp: number) => void;

  /**
   * Fires when task executor is initialized and ready to be used.
   */
  executorReady: (timestamp: number) => void;

  /**
   * Fires when task executor is about to shut down, immediately after TaskExecutor.shutdown() is called.
   */
  executorBeforeEnd: (timestamp: number) => void;

  /**
   * Fires when task executor encountered an unrecoverable error and is about to shut down.
   */
  criticalError: (err: Error) => void;

  /**
   * Fires when task executor is completely terminated.
   */
  executorEnd: (timestamp: number) => void;

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
}
