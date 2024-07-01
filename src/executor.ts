import {
  MarketOrderSpec,
  GolemInternalError,
  GolemNetwork,
  GolemNetworkOptions,
  GolemTimeoutError,
  GolemWorkError,
  Logger,
  WorkErrorCode,
  Network,
  NetworkOptions,
  LifecycleFunction,
  ResourceRentalPool,
} from "@golem-sdk/golem-js";
import { ExecutorConfig } from "./config";
import { ExecutorEvents } from "./events";
import { EventEmitter } from "eventemitter3";
import { TaskService } from "./service";
import { TaskQueue } from "./queue";
import { isNode, sleep } from "./utils";
import { Task, TaskFunction, TaskOptions } from "./task";
import { StatsService } from "./stats";

const terminatingSignals = ["SIGINT", "SIGTERM", "SIGBREAK", "SIGHUP"];

export interface TaskSpecificOptions {
  /** Number of maximum parallel running task on one TaskExecutor instance. Default is 5 */
  maxParallelTasks?: number;

  /** Timeout for execute one task in ms. Default is 300_000 (5 minutes). */
  taskTimeout?: number;

  /** The maximum number of retries when the job failed on the provider */
  maxTaskRetries?: number;

  /**
   * Timeout for waiting for signing an agreement with an available provider from the moment the task initiated.
   * This parameter is expressed in ms.
   * If it is not possible to sign an agreement within the specified time,
   * the task will stop with an error and will be queued to be retried if the `maxTaskRetries` parameter > 0
   */
  taskStartupTimeout?: number;

  /**
   * Set to false by default. If enabled, timeouts will be retried in case of timeout errors.
   */
  taskRetryOnTimeout?: boolean;
}

export type ExecutorMainOptions = {
  /** Set to `false` to completely disable logging (even if a logger is provided) */
  enableLogging?: boolean;
  /**
   * Do not install signal handlers for SIGINT, SIGTERM, SIGBREAK, SIGHUP.
   *
   * By default, TaskExecutor will install those and terminate itself when any of those signals is received.
   * This is to make sure proper shutdown with completed invoice payments.
   *
   * Note: If you decide to set this to `true`, you will be responsible for proper shutdown of task executor.
   */
  skipProcessSignals?: boolean;
  /**
   * Timeout for waiting for at least one offer from the market expressed in milliseconds.
   * This parameter (set to 90 sec by default) will issue a warning when executing `TaskExecutor.run`
   * if no offer from the market is accepted before this time. If you'd like to change this behavior,
   * and throw an error instead, set `exitOnNoProposals` to `true`.
   * You can set a slightly higher time in a situation where your parameters such as proposalFilter
   * or minimum hardware requirements are quite restrictive and finding a suitable provider
   * that meets these criteria may take a bit longer.
   */
  startupTimeout?: number;

  /**
   * Creates a new logical network within the Golem VPN infrastructure.
   * Allows communication between tasks using standard network mechanisms,
   * but requires specific implementation in the ExeUnit/runtime,
   * which must be capable of providing a standard Unix-socket interface to their payloads
   * and marshaling the logical network traffic through the Golem Net transport layer.
   * If boolean - true is provided, the network will be created with default parameters
   */
  vpn?: boolean | NetworkOptions;
  task?: TaskSpecificOptions;
};

/**
 * Contains information needed to start executor, if string the imageHash is required, otherwise it should be a type of {@link ExecutorMainOptions}
 */
export type TaskExecutorOptions = ExecutorMainOptions & GolemNetworkOptions & MarketOrderSpec;

/**
 * A high-level module for defining and executing tasks in the golem network
 */
export class TaskExecutor {
  public readonly events: EventEmitter<ExecutorEvents>;
  public readonly glm: GolemNetwork;

  private readonly options: ExecutorConfig;
  private taskService?: TaskService;
  private statsService: StatsService;
  private setupFunction?: LifecycleFunction;
  private teardownFunction?: LifecycleFunction;
  private taskQueue: TaskQueue;
  private logger: Logger;
  private lastTaskIndex = 0;
  private isRunning = true;
  private isCanceled = false;
  private startupTimeoutId?: NodeJS.Timeout;
  private resourceRentalPool?: ResourceRentalPool;
  private network?: Network;

  /**
   * Signal handler reference, needed to remove handlers on exit.
   * @param signal
   */
  private signalHandler = (signal: string) => this.cancel(signal);

  /**
   * Shutdown promise.
   * This will be set by call to shut down() method.
   * It will be resolved when the executor is fully stopped.
   */
  private shutdownPromise?: Promise<void>;

  /**
   * Create a new Task Executor
   * @description Factory Method that create and initialize an instance of the TaskExecutor
   *
   *
   * @example **Simple usage of Task Executor**
   *
   * The executor can be created by passing appropriate initial parameters such as package, budget, subnet tag, payment driver, payment network etc.
   * One required parameter is a package. This can be done in two ways. First by passing only package image hash or image tag, e.g.
   * ```js
   * const executor = await TaskExecutor.create("9a3b5d67b0b27746283cb5f287c13eab1beaa12d92a9f536b747c7ae");
   * ```
   * or
   * ```js
   * const executor = await TaskExecutor.create("golem/alpine:3.18.2");
   * ```
   *
   * @example **Usage of Task Executor with custom parameters**
   *
   * Or by passing some optional parameters, e.g.
   * ```js
   * const executor = await TaskExecutor.create({
   *   subnetTag: "public",
   *   payment: { driver: "erc-20", network: "holesky" },
   *   package: "golem/alpine:3.18.2",
   * });
   * ```
   *
   * @param options Task executor options
   * @return TaskExecutor
   */
  static async create(options: TaskExecutorOptions) {
    const executor = new TaskExecutor(options);
    await executor.init();
    return executor;
  }

  /**
   * Create a new TaskExecutor object.
   *
   * @param options - contains information needed to start executor, if string the imageHash is required, otherwise it should be a type of {@link ExecutorMainOptions}
   */
  constructor(options: TaskExecutorOptions) {
    this.options = new ExecutorConfig(options);
    this.logger = this.options.logger;
    this.taskQueue = new TaskQueue();
    this.glm = new GolemNetwork(this.options.golemNetwork);
    this.events = new EventEmitter<ExecutorEvents>();
    this.statsService = new StatsService(
      this.events,
      { market: this.glm.market.events, activity: this.glm.activity.events, payment: this.glm.payment.events },
      { logger: this.logger },
    );
    this.events.emit("executorStart", Date.now());
  }

  /**
   * Initialize executor
   *
   * @description Method responsible initialize all executor services.
   */
  async init() {
    this.logger.debug("Initializing task executor...");
    try {
      await this.glm.connect();
      if (this.options.vpn) {
        this.network = await this.glm.createNetwork(this.options.vpn === true ? undefined : this.options.vpn);
      }
      this.resourceRentalPool = await this.glm.manyOf({
        poolSize: { min: 1, max: this.options.task.maxParallelTasks },
        order: {
          ...this.options.order,
          network: this.network,
        },
        setup: this.setupFunction,
        teardown: this.teardownFunction,
      });
      await this.statsService.run();
      this.setStartupTimeout();
      this.taskService = new TaskService(
        this.taskQueue,
        this.resourceRentalPool,
        this.events,
        this.logger.child("work"),
        {
          maxParallelTasks: this.options.task.maxParallelTasks,
        },
      );
    } catch (error) {
      this.logger.error("Initialization failed", error);
      throw error;
    }

    this.taskService.run().catch((e) => this.handleCriticalError(e));

    if (isNode) this.installSignalHandlers();
    this.logger.info(`Task Executor has started`, {
      subnet: this.options.golemNetwork.payment?.network,
      network: this.options.golemNetwork.payment?.network,
      driver: this.options.golemNetwork.payment?.driver,
    });
    this.events.emit("executorReady", Date.now());
  }

  /**
   * Stop all executor services and shut down executor instance.
   *
   * You can call this method multiple times, it will resolve only once the executor is shutdown.
   *
   * When shutdown() is initially called, a beforeEnd event is emitted.
   *
   * Once the executor is fully stopped, an end event is emitted.
   */
  shutdown(): Promise<void> {
    if (!this.isRunning) {
      // Using ! is safe, because if isRunning is false, endPromise is defined.
      return this.shutdownPromise!;
    }

    this.isRunning = false;
    this.shutdownPromise = this.doShutdown();

    return this.shutdownPromise;
  }

  /**
   * Perform everything needed to cleanly shut down the executor.
   * @private
   */
  private async doShutdown() {
    this.events.emit("executorBeforeEnd", Date.now());
    if (isNode) this.removeSignalHandlers();
    clearTimeout(this.startupTimeoutId);
    await this.taskService?.end();
    await this.resourceRentalPool?.drainAndClear();
    await this.glm.disconnect();
    this.printStats();
    await this.statsService.end();
    this.logger.info("Task Executor has shut down");
    this.events.emit("executorEnd", Date.now());
  }

  getStats() {
    return {
      ...this.statsService.getAll(),
      retries: this.taskService?.getTotalRetryCount(),
    };
  }

  /**
   * Registers a setup function that will be run when an exe-unit is ready.
   * This is the perfect place to run setup functions that need to be run only once per
   * exe-unit, for example uploading files that will be used by all tasks in the exe-unit.
   * This function can be called multiple times.
   *
   * @param setup setup function that will be run when an exe-unit is ready
   * @example
   * ```ts
   * const uploadFile = async (exe) => exe.uploadFile("./file1.txt", "/file1.txt");
   *
   * executor.onExeUnitReady(uploadFile);
   *
   * await executor.run(async (exe) => {
   *  await exe.run("cat /file1.txt /file2.txt");
   * });
   * ```
   */
  onExeUnitReady(setup: LifecycleFunction) {
    this.setupFunction = setup;
  }

  /**
   * Registers a teardown function that will be run before the exe unit is destroyed.
   * This is the perfect place to run teardown functions that need to be run only once per
   * exe-unit at the end of the entire work, for example cleaning of the working environment.
   *
   * @param teardown teardown function that will be run before the exe unit is destroyed
   * @example
   * ```ts
   * const removeFile = async (exe) => exe.run("rm ./file.txt");
   *
   * executor.onExeUnitStopped(removeFile);
   *
   * await executor.run(async (exe) => {
   *  await exe.run("cat /file.txt");
   * });
   * ```
   */
  onExeUnitStopped(teardown: LifecycleFunction) {
    this.teardownFunction = teardown;
  }

  /**
   * Run task - allows to execute a single taskFunction function on the Golem network with a single provider.
   *
   * @param taskFunction function that run task
   * @param options task options
   * @return result of task computation
   * @example
   * ```typescript
   * await executor.run(async (exe) => console.log((await exe.run("echo 'Hello World'")).stdout));
   * ```
   */
  async run<OutputType>(taskFunction: TaskFunction<OutputType>, options?: TaskOptions): Promise<OutputType> {
    return this.executeTask<OutputType>(taskFunction, options);
  }

  private async executeTask<OutputType>(
    taskFunction: TaskFunction<OutputType>,
    options?: TaskOptions,
  ): Promise<OutputType> {
    let task;
    try {
      task = new Task((++this.lastTaskIndex).toString(), taskFunction, {
        maxRetries: options?.maxRetries ?? this.options.task.maxTaskRetries,
        timeout: options?.timeout ?? this.options.task.taskTimeout,
        startupTimeout: options?.startupTimeout ?? this.options.task.taskStartupTimeout,
        retryOnTimeout: options?.retryOnTimeout ?? this.options.task.taskRetryOnTimeout,
      });
      this.taskQueue.addToEnd(task);
      this.events.emit("taskQueued", task.getDetails());
      while (this.isRunning) {
        if (task.isFinished()) {
          if (task.isRejected()) throw task.getError();
          return task.getResults() as OutputType;
        }
        await sleep(2000, true);
      }
      throw new GolemInternalError("Task executor has been stopped");
    } catch (error) {
      if (error instanceof GolemWorkError) {
        throw error;
      }
      throw new GolemWorkError(
        `Unable to execute task. ${error.toString()}`,
        WorkErrorCode.ScriptExecutionFailed,
        task?.getResourceRental()?.agreement,
        undefined, // task?.getLeaseProcess()?.getActivity(),
        task?.getResourceRental()?.agreement?.provider,
        error,
      );
    }
  }

  public async cancel(reason: string) {
    try {
      if (this.isCanceled) {
        this.logger.warn("The executor is already cancelled, ignoring second request");
        return;
      }

      this.isCanceled = true;

      if (isNode) {
        this.removeSignalHandlers();
      }

      const message = `Executor has interrupted by the user. Reason: ${reason}.`;
      console.log("CANCEL");
      this.logger.info(`${message}. Stopping all tasks...`, {
        tasksInProgress: this.taskQueue.size,
      });

      await this.shutdown();
    } catch (error) {
      this.logger.error(`Error while cancelling the executor`, error);
    }
  }

  private installSignalHandlers() {
    if (this.options.skipProcessSignals) return;
    terminatingSignals.forEach((event) => {
      process.on(event, this.signalHandler);
    });
  }

  private removeSignalHandlers() {
    if (this.options.skipProcessSignals) return;
    terminatingSignals.forEach((event) => {
      process.removeListener(event, this.signalHandler);
    });
  }

  private handleCriticalError(err: Error) {
    this.events.emit("criticalError", err);
    const message =
      "TaskExecutor faced a critical error and will now cancel work, terminate agreements and request settling payments";
    this.logger.error(message, err);
    // Make sure users know in case they didn't configure logging
    console.error(message, err);
    this.cancel(`Cancelling due to critical error ${err}`).catch((cancelErr) =>
      this.logger.error("Issue when cancelling Task Executor", { err: cancelErr }),
    );
  }

  private printStats() {
    const costs = this.statsService.getAllCosts();
    const costsSummary = this.statsService.getAllCostsSummary();
    const duration = this.statsService.getComputationTime();
    const providersCount = new Set(costsSummary.map((x) => x["Provider Name"])).size;
    this.logger.info(`Computation finished in ${(duration / 1000).toFixed(1)} sec.`);
    this.logger.info(`Negotiation summary:`, {
      agreements: costsSummary.length,
      providers: providersCount,
    });
    costsSummary.forEach((cost, index) => {
      this.logger.info(`Agreement ${index + 1}:`, {
        agreement: cost["Agreement"],
        provider: cost["Provider Name"],
        tasks: cost["Task Computed"],
        cost: cost["Cost"],
        paymentStatus: cost["Payment Status"],
      });
    });
    this.logger.info(`Cost summary:`, {
      totalCost: costs.total,
      totalPaid: costs.paid,
    });
  }

  /**
   * Sets a timeout for waiting for offers from the market.
   * If at least one offer is not confirmed during the set timeout,
   * a critical error will be reported and the entire process will be interrupted.
   */
  private setStartupTimeout() {
    if (!this.options.startupTimeout) {
      return;
    }
    this.startupTimeoutId = setTimeout(() => {
      const proposalsCount = this.statsService.getProposalsCount();
      if (proposalsCount.confirmed === 0) {
        const hint =
          proposalsCount.initial === 0 && proposalsCount.confirmed === 0
            ? "Check your demand if it's not too restrictive or restart yagna."
            : proposalsCount.initial === proposalsCount.rejected
              ? "All off proposals got rejected."
              : "Check your proposal filters if they are not too restrictive.";
        const errorMessage = `Could not start any work on Golem. Processed ${proposalsCount.initial} initial proposals from yagna, filters accepted ${proposalsCount.confirmed}. ${hint}`;
        this.handleCriticalError(new GolemTimeoutError(errorMessage));
      }
    }, this.options.startupTimeout);
  }
}
