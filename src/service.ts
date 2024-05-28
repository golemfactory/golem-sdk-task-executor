import { Task } from "./task";
import { TaskQueue } from "./queue";
import {
  Logger,
  LeaseProcess,
  LeaseProcessPool,
  GolemInternalError,
  GolemWorkError,
  GolemTimeoutError,
} from "@golem-sdk/golem-js";
import { sleep } from "./utils";
import { EventEmitter } from "eventemitter3";
import { TaskExecutorEventsDict } from "./events";

export interface TaskServiceOptions {
  /** Number of maximum parallel running task on one TaskExecutor instance */
  maxParallelTasks: number;
  taskRunningIntervalMs?: number;
}

/**
 * @internal
 */
export class TaskService {
  private activeTasksCount = 0;
  private leaseProcesses = new Map<string, LeaseProcess>();
  private activitySetupDone: Set<string> = new Set();
  private isRunning = false;
  private taskRunningIntervalMs: number;

  /** To keep track of the stat */
  private retryCountTotal = 0;

  constructor(
    private tasksQueue: TaskQueue,
    private leaseProcessPool: LeaseProcessPool,
    private events: EventEmitter<TaskExecutorEventsDict>,
    private logger: Logger,
    private options: TaskServiceOptions,
  ) {
    this.taskRunningIntervalMs = options.taskRunningIntervalMs ?? 1000;
  }

  public async run() {
    this.isRunning = true;
    this.logger.info("Task Service has started");
    await this.leaseProcessPool.ready();
    while (this.isRunning) {
      if (this.activeTasksCount >= this.options.maxParallelTasks) {
        await sleep(this.taskRunningIntervalMs, true);
        continue;
      }
      const task = this.tasksQueue.get();
      if (!task) {
        await sleep(this.taskRunningIntervalMs, true);
        continue;
      }
      task.onStateChange(() => {
        if (task.isRetry()) {
          this.retryTask(task).catch((error) => this.logger.error(`Issue with retrying a task on Golem`, error));
        } else if (task.isFinished()) {
          this.stopTask(task).catch((error) => this.logger.error(`Issue with stopping a task on Golem`, error));
        }
      });
      this.startTask(task).catch(
        (error) => this.isRunning && this.logger.error(`Issue with starting a task on Golem`, error),
      );
    }
  }

  async end() {
    this.isRunning = false;
    this.logger.info("Task Service has been stopped", {
      stats: {
        retryCountTotal: this.retryCountTotal,
      },
    });
  }

  private async startTask(task: Task) {
    try {
      task.init();
      this.logger.debug(`Starting task`, { taskId: task.id, attempt: task.getRetriesCount() + 1 });
      ++this.activeTasksCount;

      if (task.isFailed()) {
        throw new GolemInternalError(`Execution of task ${task.id} aborted due to error. ${task.getError()}`);
      }

      // TODO: This should be able to be canceled if the task state has changed
      const leaseProcess = await this.leaseProcessPool.acquire();
      this.leaseProcesses.set(leaseProcess.agreement.id, leaseProcess);

      if (task.isFailed()) {
        throw new GolemInternalError(`Execution of task ${task.id} aborted due to error. ${task.getError()}`);
      }
      const ctx = await leaseProcess.getExeUnit();
      task.start(leaseProcess, ctx);
      this.events.emit("taskStarted", task.getDetails());
      this.logger.info(`Task started`, {
        taskId: task.id,
        providerName: ctx.provider.name,
        activityId: ctx.activity.id,
      });

      const activityReadySetupFunctions = task.getActivityReadySetupFunctions();
      const worker = task.getWorker();

      await ctx.before();

      if (activityReadySetupFunctions.length && !this.activitySetupDone.has(ctx.activity.id)) {
        this.activitySetupDone.add(ctx.activity.id);
        this.logger.debug(`Activity setup completed`, { activityId: ctx.activity.id });
      }
      const results = await worker(ctx);
      task.stop(results);
    } catch (error) {
      task.stop(
        undefined,
        error,
        error instanceof GolemWorkError || (error instanceof GolemTimeoutError && task.retryOnTimeout),
      );
    } finally {
      --this.activeTasksCount;
    }
  }

  private async retryTask(task: Task) {
    if (!this.isRunning) return;
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
        providerName: task.getWorkContext()?.provider.name,
      });
    } else {
      this.events.emit("taskCompleted", task.getDetails());
      this.logger.info(`Task computed`, {
        taskId: task.id,
        retries: task.getRetriesCount(),
        providerName: task.getWorkContext()?.provider.name,
      });
    }
  }

  private async releaseTaskResources(task: Task) {
    const leaseProcess = task.getLeaseProcess();
    if (leaseProcess) {
      if (task.isFailed()) {
        await this.leaseProcessPool.destroy(leaseProcess);
      } else {
        await this.leaseProcessPool.release(leaseProcess);
      }
    }
  }

  getTotalRetryCount() {
    return this.retryCountTotal;
  }
}
