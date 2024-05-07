import { Task } from "./task";
import { TaskQueue } from "./queue";
import {
  WorkContext,
  defaultLogger,
  Logger,
  YagnaApi,
  StorageProvider,
  Agreement,
  AgreementPoolService,
  PaymentService,
  NetworkNode,
  NetworkService,
  Activity,
  ActivityOptions,
} from "@golem-sdk/golem-js";
import { TaskConfig } from "./config";
import { sleep } from "./utils";
import { EventEmitter } from "eventemitter3";
import { TaskExecutorEventsDict } from "./events";

export interface TaskServiceOptions extends ActivityOptions {
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
  private activities = new Map<string, Activity>();
  private activitySetupDone: Set<string> = new Set();
  private isRunning = false;
  private logger: Logger;
  private options: TaskConfig;

  constructor(
    private yagnaApi: YagnaApi,
    private tasksQueue: TaskQueue,
    private events: EventEmitter<TaskExecutorEventsDict>,
    private agreementPoolService: AgreementPoolService,
    private paymentService: PaymentService,
    private networkService?: NetworkService,
    options?: TaskServiceOptions,
  ) {
    this.options = new TaskConfig(options);
    this.logger = options?.logger || defaultLogger("work");
  }

  public async run() {
    this.isRunning = true;
    this.logger.info("Task Service has started");
    while (this.isRunning) {
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
    this.logger.debug(`Trying to stop all activities`, { size: this.activities.size });
    await Promise.all(
      [...this.activities.values()].map((activity) =>
        activity
          .stop()
          .catch((error) => this.logger.warn(`Stopping activity failed`, { activityId: activity.id, error })),
      ),
    );
    this.logger.info("Task Service has been stopped");
  }

  private async startTask(task: Task) {
    task.init();
    this.logger.debug(`Starting task`, { taskId: task.id, attempt: task.getRetriesCount() + 1 });
    ++this.activeTasksCount;

    const agreement = await this.agreementPoolService.getAgreement();
    let activity: Activity | undefined;
    let networkNode: NetworkNode | undefined;

    try {
      this.startAcceptingAgreementPayments(agreement);
      activity = await this.getOrCreateActivity(agreement);
      task.start(activity, networkNode);
      this.events.emit("taskStarted", task.getDetails());
      this.logger.info(`Task started`, {
        taskId: task.id,
        providerName: agreement.getProviderInfo().name,
        activityId: activity.id,
      });

      const activityReadySetupFunctions = task.getActivityReadySetupFunctions();
      const worker = task.getWorker();
      if (this.networkService && !this.networkService.hasNode(agreement.getProviderInfo().id)) {
        networkNode = await this.networkService.addNode(agreement.getProviderInfo().id);
      }

      const ctx = new WorkContext(activity, {
        yagnaOptions: this.yagnaApi.yagnaOptions,
        activityReadySetupFunctions: this.activitySetupDone.has(activity.id) ? [] : activityReadySetupFunctions,
        storageProvider: this.options.storageProvider,
        networkNode,
        logger: this.logger,
        activityPreparingTimeout: this.options.activityPreparingTimeout,
        activityStateCheckingInterval: this.options.activityStateCheckingInterval,
      });

      await ctx.before();

      if (activityReadySetupFunctions.length && !this.activitySetupDone.has(activity.id)) {
        this.activitySetupDone.add(activity.id);
        this.logger.debug(`Activity setup completed`, { activityId: activity.id });
      }
      const results = await worker(ctx);
      task.stop(results);
    } catch (error) {
      task.stop(undefined, error);
    } finally {
      --this.activeTasksCount;
    }
  }

  private async stopActivity(activity: Activity) {
    await activity.stop();
    this.activities.delete(activity.agreement.id);
  }

  private startAcceptingAgreementPayments(agreement: Agreement) {
    const agreementAlreadyAccepted = this.activities.has(agreement.id);
    if (agreementAlreadyAccepted) return;
    this.paymentService.acceptPayments(agreement);
  }

  private async getOrCreateActivity(agreement: Agreement) {
    const previous = this.activities.get(agreement.id);
    if (previous) {
      return previous;
    } else {
      const activity = await Activity.create(agreement, this.yagnaApi, this.options);
      this.activities.set(agreement.id, activity);
      return activity;
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
      this.tasksQueue.addToBegin(task);
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
        providerName: task.getActivity()?.getProviderInfo().name,
      });
    } else {
      this.events.emit("taskCompleted", task.getDetails());
      this.logger.info(`Task computed`, {
        taskId: task.id,
        retries: task.getRetriesCount(),
        providerName: task.getActivity()?.getProviderInfo().name,
      });
    }
  }

  private async releaseTaskResources(task: Task) {
    const activity = task.getActivity();
    if (activity) {
      if (task.isFailed()) {
        /**
         * Activity should only be terminated when the task fails.
         * We assume that the next attempt should be performed on a new activity instance.
         * For successfully completed tasks, activities remain in the ready state
         * and are ready to be used for other tasks.
         * For them, termination will be completed with the end of service
         */
        await this.stopActivity(activity).catch((error) =>
          this.logger.error(`Stopping activity failed`, { activityId: activity.id, error }),
        );
      }
      await this.agreementPoolService
        .releaseAgreement(activity.agreement.id, task.isDone())
        .catch((error) =>
          this.logger.error(`Releasing agreement failed`, { agreementId: activity.agreement.id, error }),
        );
    }
    const networkNode = task.getNetworkNode();
    if (this.networkService && networkNode) {
      await this.networkService
        .removeNode(networkNode.id)
        .catch((error) => this.logger.error(`Removing network node failed`, { nodeId: networkNode.id, error }));
    }
  }
}
