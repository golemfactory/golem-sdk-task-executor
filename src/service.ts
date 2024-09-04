import { Task, TaskState } from "./task";
import { TaskQueue } from "./queue";
import {
  GolemInternalError,
  GolemTimeoutError,
  GolemWorkError,
  ResourceRentalPool,
  Logger,
  anyAbortSignal,
} from "@golem-sdk/golem-js";
import { sleep } from "./utils";
import { EventEmitter } from "eventemitter3";
import { ExecutorEvents } from "./events";

export interface TaskServiceOptions {
  /** Number of maximum parallel running task on one TaskExecutor instance */
  maxParallelTasks: number;
}

/**
 * @internal
 */
export class TaskService {
  private activeTasksCount = 0;
  private abortController = new AbortController();

  /** To keep track of the stat */
  private retryCountTotal = 0;

  constructor(
    private tasksQueue: TaskQueue,
    private resourceRentalPool: ResourceRentalPool,
    private events: EventEmitter<ExecutorEvents>,
    private logger: Logger,
    private options: TaskServiceOptions,
  ) {}

  public async run() {
    this.logger.info("Task Service has started");
    await this.resourceRentalPool.ready();
    while (!this.abortController.signal.aborted) {
      if (this.activeTasksCount >= this.options.maxParallelTasks) {
        await sleep(0);
        continue;
      }
      const task = this.tasksQueue.get();
      if (!task) {
        await sleep(0);
        continue;
      }
      task.onStateChange(() => {
        if (task.isRetry()) {
          this.retryTask(task)
            .catch((error) => this.logger.error(`Issue with retrying a task on Golem`, error))
            .finally(() => --this.activeTasksCount);
        } else if (task.isFinished()) {
          this.stopTask(task)
            .catch((error) => this.logger.error(`Issue with stopping a task on Golem`, error))
            .finally(() => --this.activeTasksCount);
        }
      });
      ++this.activeTasksCount;
      this.startTask(task).catch(
        (error) =>
          !this.abortController.signal.aborted && this.logger.error(`Issue with starting a task on Golem`, error),
      );
    }
  }

  async end() {
    this.abortController.abort();
    this.logger.info("Task Service has been stopped", {
      stats: {
        retryCountTotal: this.retryCountTotal,
      },
    });
  }

  private async startTask(task: Task) {
    const abortController = new AbortController();
    const { signal, cleanup } = anyAbortSignal(this.abortController.signal, abortController.signal);
    try {
      task.init();
      this.logger.debug(`Starting task`, { taskId: task.id, attempt: task.getRetriesCount() + 1 });

      if (task.isFailed()) {
        throw new GolemInternalError(`Execution of task ${task.id} aborted due to error. ${task.getError()}`);
      }

      task.onStateChange((state) => {
        if (state === TaskState.Rejected || state === TaskState.Retry) {
          abortController.abort();
        }
      });
      const rental = await this.resourceRentalPool.acquire(signal);

      if (task.isFailed()) {
        throw new GolemInternalError(`Execution of task ${task.id} aborted due to error. ${task.getError()}`);
      }

      const exe = await rental.getExeUnit(signal);
      task.start(rental, exe);
      this.events.emit("taskStarted", task.getDetails());
      this.logger.info(`Task started`, {
        taskId: task.id,
        providerName: exe.provider.name,
        activityId: exe.activity.id,
      });

      const taskFunction = task.getTaskFunction();
      const results = await taskFunction(exe);
      task.stop(results);
    } catch (error) {
      task.stop(
        undefined,
        error,
        error instanceof GolemWorkError || (error instanceof GolemTimeoutError && task.retryOnTimeout),
      );
    } finally {
      cleanup();
    }
  }

  private async retryTask(task: Task) {
    if (this.abortController.signal.aborted) return;
    task.cleanup();
    await this.releaseTaskResources(task);
    const reason = task.getError()?.message;
    this.events.emit("taskRetried", task.getDetails());
    this.logger.warn(`Task execution failed. Trying to redo the task.`, {
      taskId: task.id,
      attempt: task.getRetriesCount(),
      reason,
    });
    if (!this.tasksQueue.has(task)) {
      this.retryCountTotal++;
      this.tasksQueue.addToBegin(task);
      this.logger.debug(`Task ${task.id} added to the queue`);
    } else {
      this.logger.warn(`Task ${task.id} has been already added to the queue`);
    }
  }

  private async stopTask(task: Task) {
    task.cleanup();
    await this.releaseTaskResources(task);
    if (task.isRejected()) {
      this.events.emit("taskFailed", task.getDetails());
      this.logger.error(`Task has been rejected`, {
        taskId: task.id,
        reason: task.getError()?.message,
        retries: task.getRetriesCount(),
        providerName: task.getExeUnit()?.provider.name,
      });
    } else {
      this.events.emit("taskCompleted", task.getDetails());
      this.logger.info(`Task computed`, {
        taskId: task.id,
        retries: task.getRetriesCount(),
        providerName: task.getExeUnit()?.provider.name,
      });
    }
  }

  private async releaseTaskResources(task: Task) {
    const rental = task.getResourceRental();
    if (rental) {
      if (task.isFailed()) {
        await this.resourceRentalPool.destroy(rental);
      } else {
        await this.resourceRentalPool.release(rental);
      }
    }
  }

  getTotalRetryCount() {
    return this.retryCountTotal;
  }
}
