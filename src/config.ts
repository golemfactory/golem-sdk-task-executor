import { ExecutorOptions } from "./executor";
import { isBrowser } from "./utils";
import { TaskServiceOptions } from "./service";
import {
  GolemConfigError,
  Logger,
  nullLogger,
  Package,
  PackageOptions,
  StorageProvider,
  ActivityConfig,
  defaultLogger,
} from "@golem-sdk/golem-js";

const DEFAULTS = Object.freeze({
  payment: { driver: "erc20", network: "goerli" },
  budget: 1.0,
  subnetTag: "public",
  basePath: "http://127.0.0.1:7465",
  maxParallelTasks: 5,
  maxTaskRetries: 3,
  taskTimeout: 1000 * 60 * 5, // 5 min,
  startupTaskTimeout: 1000 * 60 * 2, // 2 min,
  enableLogging: true,
  startupTimeout: 1000 * 90, // 90 sec
  exitOnNoProposals: false,
  taskRunningInterval: 1000,
  activityStateCheckingInterval: 2000,
  activityPreparingTimeout: 1000 * 60 * 4, // 2 min
});

/**
 * @internal
 */
export class ExecutorConfig {
  readonly package?: Package | string;
  readonly maxParallelTasks: number;
  readonly taskTimeout: number;
  readonly startupTaskTimeout: number;
  readonly budget: number;
  readonly subnetTag: string;
  readonly networkIp?: string;
  readonly packageOptions: Omit<PackageOptions, "imageHash" | "imageTag">;
  readonly yagnaOptions: { apiKey: string; basePath: string };
  readonly logger: Logger;
  readonly eventTarget: EventTarget;
  readonly maxTaskRetries: number;
  readonly startupTimeout: number;
  readonly exitOnNoProposals: boolean;
  readonly agreementMaxPoolSize: number;

  constructor(options: ExecutorOptions & TaskServiceOptions) {
    const processEnv = !isBrowser
      ? process
      : {
          env: {
            YAGNA_APPKEY: null,
            YAGNA_API_URL: null,
            YAGNA_SUBNET: null,
          },
        };
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore FIXME: this weirdness may not be needed anymore?
    Object.keys(options).forEach((key) => (this[key] = options[key]));
    const apiKey = options?.yagnaOptions?.apiKey || processEnv.env.YAGNA_APPKEY;
    if (!apiKey) {
      throw new GolemConfigError("Api key not defined");
    }
    if (options.maxTaskRetries && options.maxTaskRetries < 0) {
      throw new GolemConfigError("The maxTaskRetries parameter cannot be less than zero");
    }
    this.yagnaOptions = {
      apiKey,
      basePath: options.yagnaOptions?.basePath || processEnv.env.YAGNA_API_URL || DEFAULTS.basePath,
    };
    this.package = options.package;
    this.packageOptions = {
      engine: options.engine,
      minMemGib: options.minMemGib,
      minStorageGib: options.minStorageGib,
      minCpuThreads: options.minCpuThreads,
      minCpuCores: options.minCpuCores,
      capabilities: options.capabilities,
      manifest: options.manifest,
      manifestSig: options.manifestSig,
      manifestSigAlgorithm: options.manifestSigAlgorithm,
      manifestCert: options.manifestCert,
    };
    this.budget = options.budget || DEFAULTS.budget;
    this.maxParallelTasks = options.maxParallelTasks || DEFAULTS.maxParallelTasks;
    this.taskTimeout = options.taskTimeout || DEFAULTS.taskTimeout;
    this.startupTaskTimeout = options.startupTimeout || DEFAULTS.startupTaskTimeout;
    this.subnetTag = options.subnetTag || processEnv.env?.YAGNA_SUBNET || DEFAULTS.subnetTag;
    this.networkIp = options.networkIp;
    this.logger = (() => {
      const isLoggingEnabled = options.enableLogging ?? DEFAULTS.enableLogging;
      if (!isLoggingEnabled) return nullLogger();
      if (options.logger) return options.logger.child("task-executor");
      return defaultLogger("task-executor", { disableAutoPrefix: true });
    })();
    this.eventTarget = options.eventTarget || new EventTarget();
    this.maxTaskRetries = options.maxTaskRetries ?? DEFAULTS.maxTaskRetries;
    this.startupTimeout = options.startupTimeout ?? DEFAULTS.startupTimeout;
    this.exitOnNoProposals = options.exitOnNoProposals ?? DEFAULTS.exitOnNoProposals;
    /**
     * If the user does not explicitly specify the maximum size of the aggregate pool, the value of maxParallelTask will be set.
     * This means that the pool will contain a maximum number of agreements ready for reuse equal to the maximum number of tasks executed simultaneously.
     * This will avoid the situation of keeping unused agreements and activities and, consequently, unnecessary costs.
     */
    this.agreementMaxPoolSize = options.agreementMaxPoolSize ?? DEFAULTS.maxParallelTasks;
  }
}

/**
 * @internal
 */
export class TaskConfig extends ActivityConfig {
  public readonly maxParallelTasks: number;
  public readonly taskRunningInterval: number;
  public readonly taskTimeout: number;
  public readonly activityStateCheckingInterval: number;
  public readonly activityPreparingTimeout: number;
  public readonly storageProvider?: StorageProvider;
  public readonly logger: Logger;

  constructor(options?: TaskServiceOptions) {
    const activityExecuteTimeout = options?.activityExecuteTimeout || options?.taskTimeout || DEFAULTS.taskTimeout;
    super({ ...options, activityExecuteTimeout });
    this.maxParallelTasks = options?.maxParallelTasks || DEFAULTS.maxParallelTasks;
    this.taskRunningInterval = options?.taskRunningInterval || DEFAULTS.taskRunningInterval;
    this.taskTimeout = options?.taskTimeout || DEFAULTS.taskTimeout;
    this.activityStateCheckingInterval =
      options?.activityStateCheckingInterval || DEFAULTS.activityStateCheckingInterval;
    this.logger = options?.logger || defaultLogger("work", { disableAutoPrefix: true });
    this.storageProvider = options?.storageProvider;
    this.activityPreparingTimeout = options?.activityPreparingTimeout || DEFAULTS.activityPreparingTimeout;
  }
}
