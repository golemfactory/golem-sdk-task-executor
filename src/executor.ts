import {
  Logger,
  StorageProvider,
  GolemWorkError,
  WorkErrorCode,
  Worker,
  GolemInternalError,
  GolemTimeoutError,
  GolemNetwork,
  LeaseProcessPool,
  Proposal,
  AgreementSelector,
} from "@golem-sdk/golem-js";
import { ExecutorConfig } from "./config";
import { TaskExecutorEventsDict } from "./events";
import { EventEmitter } from "eventemitter3";
import { TaskService, TaskServiceOptions } from "./service";
import { TaskQueue } from "./queue";
import { isNode, sleep } from "./utils";
import { Task, TaskOptions } from "./task";
import { StatsService } from "./stats";
import { CreateActivityPoolOptions, Deployment } from "@golem-sdk/golem-js/dist/experimental";

const terminatingSignals = ["SIGINT", "SIGTERM", "SIGBREAK", "SIGHUP"];

export type ExecutorOptions = {
  /** Image hash or image tag as string, otherwise Package object */
  package?: string;
  /** Timeout for execute one task in ms. Default is 300_000 (5 minutes). */
  taskTimeout?: number;
  /** Subnet Tag */
  subnetTag?: string;
  /** Logger module */
  logger?: Logger;
  /** Set to `false` to completely disable logging (even if a logger is provided) */
  enableLogging?: boolean;
  /** Yagna Options */
  yagnaOptions?: YagnaOptions;
  /** The maximum number of retries when the job failed on the provider */
  maxTaskRetries?: number;
  /** Custom Storage Provider used for transfer files */
  storageProvider?: StorageProvider;
  /** Timeout for preparing activity - creating and deploy commands */
  activityPreparingTimeout?: number;
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
   * Timeout for waiting for signing an agreement with an available provider from the moment the task initiated.
   * This parameter is expressed in ms. Default is 120_000 (2 minutes).
   * If it is not possible to sign an agreement within the specified time,
   * the task will stop with an error and will be queued to be retried if the `maxTaskRetries` parameter > 0
   */
  taskStartupTimeout?: number;
  /**
   * If set to `true`, the executor will exit with an error when no proposals are accepted.
   * You can customize how long the executor will wait for proposals using the `startupTimeout` parameter.
   * Default is `false`.
   */
  exitOnNoProposals?: boolean;

  taskRetryOnTimeout?: boolean;
} & TaskServiceOptions &
  TmpServiceOptionsReplacement;

interface TmpServiceOptionsReplacement {
  //  --------------- PACKAGE OPTIONS -------------------
  /** Type of engine required: vm, emscripten, sgx, sgx-js, sgx-wasm, sgx-wasi */
  engine?: string;
  /** Minimum required memory to execute application GB */
  minMemGib?: number;
  /** Minimum required disk storage to execute tasks in GB */
  minStorageGib?: number;
  /** Minimum required CPU threads */
  minCpuThreads?: number;
  /** Minimum required CPU cores */
  minCpuCores?: number;
  /** Required providers capabilities to run application */
  capabilities?: string[];
  /**  finds package by its contents hash */
  imageHash?: string;
  /**  finds package by registry tag  */
  imageTag?: string;
  manifest?: string;
  /** Signature of base64 encoded Computation Payload Manifest **/
  manifestSig?: string;
  /** Algorithm of manifest signature, e.g. "sha256" **/
  manifestSigAlgorithm?: string;
  /** Certificate - base64 encoded public certificate (DER or PEM) matching key used to generate signature **/
  manifestCert?: string;

  //  --------------- MARKET SERVICE OPTIONS -------------------
  /**
   * A custom filter checking the proposal from the market for each provider and its hardware configuration.
   * Duplicate proposals from one provider are reduced to the cheapest one.
   */
  proposalFilter?: ProposalFilter;
  /** The minimum number of proposals after which the batch of proposal will be processed in order to avoid duplicates */
  minProposalsBatchSize?: number;
  /** The maximum waiting time for proposals to be batched in order to avoid duplicates */
  proposalsBatchReleaseTimeoutMs?: number;

  //  --------------- PAYMENT SERVICE OPTIONS -------------------

  /** Interval for checking new invoices */
  invoiceFetchingInterval?: number;
  /** Interval for checking new debit notes */
  debitNotesFetchingInterval?: number;
  /** Maximum number of invoice events per one fetching */
  maxInvoiceEvents?: number;
  /** Maximum number of debit notes events per one fetching */
  maxDebitNotesEvents?: number;
  /** A custom filter that checks every debit notes coming from providers */
  debitNotesFilter?: () => boolean;
  /** A custom filter that checks every invoices coming from providers */
  invoiceFilter?: () => boolean;
  budget?: number;
  payment?: { driver?: string; network?: string };
  paymentTimeout?: number;
  paymentRequestTimeout?: number;
  unsubscribeTimeoutMs?: number;

  //  --------------- ACTIVITY SERVICE OPTIONS -------------------

  /** timeout for sending and creating batch */
  activityRequestTimeout?: number;
  /** timeout for executing batch */
  activityExecuteTimeout?: number;
  /** interval for fetching batch results while polling */
  activityExeBatchResultPollIntervalSeconds?: number;

  //  --------------- AGREEMENT SERVICE OPTIONS -------------------

  /** The selector used when choosing a provider from a pool of existing offers (from the market or already used before) */
  agreementSelector?: AgreementSelector;
  /** The maximum number of events fetched in one request call  */
  agreementMaxEvents?: number;
  /** interval for fetching agreement events */
  agreementEventsFetchingIntervalSec?: number;
  /** The maximum number of agreements stored in the pool */
  agreementMaxPoolSize?: number;

  //  --------------- NETWORK OPTIONS -------------------

  /** the IP address of the network. May contain netmask, e.g. "192.168.0.0/24" */
  networkIp?: string;
  /** the desired IP address of the requestor node within the newly-created network */
  networkOwnerIp?: string;
  /** optional netmask (only if not provided within the `ip` argument) */
  networkMask?: string;
  /** optional gateway address for the network */
  networkGateway?: string;

  //  --------------- DEMAND OPTIONS -------------------

  subnetTag?: string;

  expirationSec?: number;

  maxOfferEvents?: number;

  offerFetchingIntervalSec?: number;

  proposalTimeout?: number;

  debitNotesAcceptanceTimeoutSec?: number;

  midAgreementDebitNoteIntervalSec?: number;

  midAgreementPaymentTimeoutSec?: number;
}

export type ProposalFilter = (proposal: Proposal) => boolean;

/**
 * Contains information needed to start executor, if string the imageHash is required, otherwise it should be a type of {@link ExecutorOptions}
 */
export type ExecutorOptionsMixin = string | ExecutorOptions;

export type YagnaOptions = {
  apiKey?: string;
  basePath?: string;
};

/**
 * A high-level module for defining and executing tasks in the golem network
 */
export class TaskExecutor {
  /**
   * EventEmitter (EventEmitter3) instance emitting TaskExecutor events.
   * @see TaskExecutorEventsDict for available events.
   */
  readonly events: EventEmitter<TaskExecutorEventsDict> = new EventEmitter();

  private readonly options: ExecutorConfig;
  private taskService: TaskService;
  private statsService: StatsService;
  private activityReadySetupFunctions: Worker<unknown>[] = [];
  private taskQueue: TaskQueue;
  private logger: Logger;
  private lastTaskIndex = 0;
  private isRunning = true;
  private configOptions: ExecutorOptions;
  private isCanceled = false;
  private startupTimeoutId?: NodeJS.Timeout;
  private golemNetwork: GolemNetwork;
  private deployment: Deployment;
  private leaseProcessPool?: LeaseProcessPool;

  /**
   * Signal handler reference, needed to remove handlers on exit.
   * @param signal
   */
  private signalHandler = (signal: string) => this.cancel(signal);

  /**
   * Shutdown promise.
   * This will be set by call to shutdown() method.
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
  static async create(options: ExecutorOptionsMixin) {
    const executor = new TaskExecutor(options);
    await executor.init();
    return executor;
  }

  /**
   * Create a new TaskExecutor object.
   *
   * @param options - contains information needed to start executor, if string the imageHash is required, otherwise it should be a type of {@link ExecutorOptions}
   */
  constructor(options: ExecutorOptionsMixin) {
    this.configOptions = (typeof options === "string" ? { package: options } : options) as ExecutorOptions;
    this.options = new ExecutorConfig(this.configOptions);
    this.logger = this.options.logger;
    this.taskQueue = new TaskQueue();
    // TODO: map ExecutorOptions -> GolemNetworkOptions
    const golemNetworkOptions = {};
    this.golemNetwork = new GolemNetwork({ logger: this.logger, ...golemNetworkOptions });
    const builder = this.golemNetwork.creteDeploymentBuilder();
    // TODO: map ExecutorOptions -> ActivityPoolOptions
    const activityPoolOptions = {} as CreateActivityPoolOptions;
    builder.createActivityPool("task-executor", activityPoolOptions);
    this.deployment = builder.getDeployment();

    this.taskService = new TaskService(this.taskQueue, this.leaseProcessPool, this.events, {
      ...this.options,
      logger: this.logger.child("work"),
    });
    this.statsService = new StatsService(this.events, { logger: this.logger.child("stats") });
    // TODO: events handling
    this.events.emit("start", Date.now());
  }

  /**
   * Initialize executor
   *
   * @description Method responsible initialize all executor services.
   */
  async init() {
    this.logger.debug("Initializing task executor...");
    try {
      await this.golemNetwork.connect();
      await this.deployment.start();
      this.leaseProcessPool = this.deployment.getLeaseProcessPool("task-executor");
      await this.leaseProcessPool?.ready();
      await this.taskService.run();
      await this.statsService.run();
    } catch (error) {
      this.logger.error("Initialization failed", error);
      throw error;
    }

    this.taskService.run().catch((e) => this.handleCriticalError(e));

    if (isNode) this.installSignalHandlers();
    // this.options.eventTarget.dispatchEvent(new Events.ComputationStarted());
    this.logger.info(`Task Executor has started`, {
      subnet: this.options.subnetTag,
      // TODO: get netowrk and driver from golemNetwork ... ?
      // network: this.paymentService.config.payment.network,
      // driver: this.paymentService.config.payment.driver,
    });
    this.events.emit("ready", Date.now());
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
    this.events.emit("beforeEnd", Date.now());
    if (isNode) this.removeSignalHandlers();
    clearTimeout(this.startupTimeoutId);
    await this.taskService.end();
    await this.deployment?.stop();
    await this.golemNetwork.disconnect();
    this.printStats();
    await this.statsService.end();
    this.logger.info("Task Executor has shut down");
    this.events.emit("end", Date.now());
  }

  getStats() {
    return {
      ...this.statsService.getAll(),
      retries: this.taskService.getRetryCount(),
    };
  }

  /**
   * Registers a worker function that will be run when an activity is ready.
   * This is the perfect place to run setup functions that need to be run only once per
   * activity, for example uploading files that will be used by all tasks in the activity.
   * This function can be called multiple times, each worker will be run in the order
   * they were registered.
   *
   * @param worker worker function that will be run when an activity is ready
   * @example
   * ```ts
   * const uploadFile1 = async (ctx) => ctx.uploadFile("./file1.txt", "/file1.txt");
   * const uploadFile2 = async (ctx) => ctx.uploadFile("./file2.txt", "/file2.txt");
   *
   * executor.onActivityReady(uploadFile1);
   * executor.onActivityReady(uploadFile2);
   *
   * await executor.run(async (ctx) => {
   *  await ctx.run("cat /file1.txt /file2.txt");
   * });
   * ```
   */
  onActivityReady(worker: Worker<unknown>) {
    this.activityReadySetupFunctions.push(worker);
  }

  /**
   * Run task - allows to execute a single worker function on the Golem network with a single provider.
   *
   * @param worker function that run task
   * @param options task options
   * @return result of task computation
   * @example
   * ```typescript
   * await executor.run(async (ctx) => console.log((await ctx.run("echo 'Hello World'")).stdout));
   * ```
   */
  async run<OutputType>(worker: Worker<OutputType>, options?: TaskOptions): Promise<OutputType> {
    return this.executeTask<OutputType>(worker, options);
  }

  private async executeTask<OutputType>(worker: Worker<OutputType>, options?: TaskOptions): Promise<OutputType> {
    let task;
    try {
      task = new Task((++this.lastTaskIndex).toString(), worker, {
        maxRetries: options?.maxRetries ?? this.options.maxTaskRetries,
        timeout: options?.timeout ?? this.options.taskTimeout,
        startupTimeout: options?.startupTimeout ?? this.options.taskStartupTimeout,
        activityReadySetupFunctions: this.activityReadySetupFunctions,
        retryOnTimeout: options?.retryOnTimeout ?? this.options.taskRetryOnTimeout,
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
        task?.getLeaseProcess()?.agreement,
        undefined, // task?.getLeaseProcess()?.getActivity(),
        task?.getLeaseProcess()?.agreement?.getProviderInfo(),
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

      this.logger.info(`${message}. Stopping all tasks...`, {
        tasksInProgress: this.taskQueue.size,
      });

      await this.shutdown();
    } catch (error) {
      this.logger.error(`Error while cancelling the executor`, error);
    }
  }

  private installSignalHandlers() {
    if (this.configOptions.skipProcessSignals) return;
    terminatingSignals.forEach((event) => {
      process.on(event, this.signalHandler);
    });
  }

  private removeSignalHandlers() {
    if (this.configOptions.skipProcessSignals) return;
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
    this.startupTimeoutId = setTimeout(() => {
      // TODO: get stats for demand / pool
      // const proposalsCount = this.leaseProcessPool.getProposalsCount();
      // TODO: tmp mock - FIXME
      const proposalsCount = { confirmed: 1, initial: 1, rejected: 0 };
      if (proposalsCount.confirmed === 0) {
        const hint =
          proposalsCount.initial === 0 && proposalsCount.confirmed === 0
            ? "Check your demand if it's not too restrictive or restart yagna."
            : proposalsCount.initial === proposalsCount.rejected
              ? "All off proposals got rejected."
              : "Check your proposal filters if they are not too restrictive.";
        const errorMessage = `Could not start any work on Golem. Processed ${proposalsCount.initial} initial proposals from yagna, filters accepted ${proposalsCount.confirmed}. ${hint}`;
        if (this.options.exitOnNoProposals) {
          this.handleCriticalError(new GolemTimeoutError(errorMessage));
        } else {
          console.error(errorMessage);
        }
      }
    }, this.options.startupTimeout);
  }
}
