import { Task } from "./task";
import { TaskQueue } from "./queue";
import {
  defaultLogger,
  Logger,
  StorageProvider,
  LeaseProcess,
  LeaseProcessPool,
  GolemInternalError,
} from "@golem-sdk/golem-js";
import { TaskConfig } from "./config";
import { sleep } from "./utils";
import { EventEmitter } from "eventemitter3";
import { TaskExecutorEventsDict } from "./events";

// TODO: to verify which are needed now
export interface TaskServiceOptions {
  /** Number of maximum parallel running task on one TaskExecutor instance */
  maxParallelTasks?: number;
  taskRunningInterval?: number;
  activityStateCheckingInterval?: number;
  activityPreparingTimeout?: number;
  taskTimeout?: number;
  logger?: Logger;
  storageProvider?: StorageProvider;
}

/**
 * @internal
 */
export class TaskService {
  private activeTasksCount = 0;
  private leaseProcesses = new Map<string, LeaseProcess>();
  private activitySetupDone: Set<string> = new Set();
  private isRunning = false;
  private logger: Logger;
  private options: TaskConfig;
  private retryOnTimeout: boolean = true;

  /** To keep track of the stat */
  private retryCount = 0;

  constructor(
    private tasksQueue: TaskQueue,
    private leaseProcessPool: LeaseProcessPool,
    private events: EventEmitter<TaskExecutorEventsDict>,
    options?: TaskServiceOptions,
  ) {
    this.options = new TaskConfig(options);
    this.logger = options?.logger || defaultLogger("work");
  }

  public async run() {
    this.isRunning = true;
    this.logger.info("Task Service has started");
    while (this.isRunning) {
      // TODO: this.leaseProcessPool.getProposalsCount()
      // const proposalsCount = this.leaseProcessPool.getProposalsCount();
      // if (this.activeTasksCount >= this.options.maxParallelTasks || proposalsCount.confirmed === 0) {
      if (this.activeTasksCount >= this.options.maxParallelTasks) {
        await sleep(this.options.taskRunningInterval, true);
        continue;
      }
      const task = this.tasksQueue.get();
      if (!task) {
        await sleep(this.options.taskRunningInterval, true);
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
    this.logger.debug(`Trying to destroy all lease process`, { size: this.leaseProcesses.size });
    await Promise.all(
      [...this.leaseProcesses.values()].map((lease) =>
        lease
          .finalize()
          .catch((error) =>
            this.logger.warn(`Stopping lease process failed`, { agreementId: lease.agreement.id, error }),
          ),
      ),
    );
    this.logger.info("Task Service has been stopped", {
      stats: {
        retryCount: this.retryCount,
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
      task.start(leaseProcess);
      this.events.emit("taskStarted", task.getDetails());
      this.logger.info(`Task started`, {
        taskId: task.id,
        providerName: ctx.provider.name,
        activityId: ctx.activity.id,
      });

      const activityReadySetupFunctions = task.getActivityReadySetupFunctions();
      const worker = task.getWorker();

      // TODO: how to express the need to get a leaseProcess belonging to a network (which has a networkNode in it).
      //  Maybe every leaseProcess belongs to the network if it was added in the deployment builder?
      // if (this.networkService && !this.networkService.hasNode(agreement.getProviderInfo().id)) {
      //   networkNode = await this.networkService.addNode(agreement.getProviderInfo().id);
      // }

      await ctx.before();

      if (activityReadySetupFunctions.length && !this.activitySetupDone.has(ctx.activity.id)) {
        this.activitySetupDone.add(ctx.activity.id);
        this.logger.debug(`Activity setup completed`, { activityId: ctx.activity.id });
      }
      const results = await worker(ctx);
      task.stop(results);
    } catch (error) {
      task.stop(undefined, error);
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
      this.retryCount++;
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
        providerName: task.getLeaseProcess()?.agreement?.getProviderInfo()?.name,
      });
    } else {
      this.events.emit("taskCompleted", task.getDetails());
      this.logger.info(`Task computed`, {
        taskId: task.id,
        retries: task.getRetriesCount(),
        providerName: task.getLeaseProcess()?.agreement?.getProviderInfo()?.name,
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

  getRetryCount() {
    return this.retryCount;
  }
}
