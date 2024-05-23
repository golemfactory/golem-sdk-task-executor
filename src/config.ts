import { ExecutorOptions } from "./executor";
import { TaskServiceOptions } from "./service";
import { GolemConfigError, Logger, nullLogger, StorageProvider, defaultLogger } from "@golem-sdk/golem-js";

const DEFAULTS = Object.freeze({
  maxParallelTasks: 5,
  maxTaskRetries: 3,
  taskRetryOnTimeout: false,
  enableLogging: true,
  startupTimeout: 1000 * 90, // 90 sec
  exitOnNoProposals: false,
  taskRunningInterval: 1000,
});

/**
 * @internal
 */
export class ExecutorConfig {
  readonly maxParallelTasks: number;
  readonly taskTimeout?: number;
  readonly taskStartupTimeout?: number;
  readonly networkIp?: string;
  readonly logger: Logger;
  readonly maxTaskRetries: number;
  readonly startupTimeout: number;
  readonly exitOnNoProposals: boolean;
  readonly taskRetryOnTimeout: boolean;

  constructor(options: ExecutorOptions & TaskServiceOptions) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore FIXME: this weirdness may not be needed anymore?
    Object.keys(options).forEach((key) => (this[key] = options[key]));
    if (options.maxTaskRetries && options.maxTaskRetries < 0) {
      throw new GolemConfigError("The maxTaskRetries parameter cannot be less than zero");
    }
    this.maxParallelTasks = options.maxParallelTasks || DEFAULTS.maxParallelTasks;
    this.taskTimeout = options.taskTimeout;
    this.taskStartupTimeout = options.taskStartupTimeout;
    // this.networkIp = options.networkIp;
    this.taskRetryOnTimeout = options.taskRetryOnTimeout ?? DEFAULTS.taskRetryOnTimeout;
    this.logger = (() => {
      const isLoggingEnabled = options.enableLogging ?? DEFAULTS.enableLogging;
      if (!isLoggingEnabled) return nullLogger();
      if (options.logger) return options.logger.child("task-executor");
      return defaultLogger("task-executor", { disableAutoPrefix: true });
    })();
    // this.eventTarget = options.eventTarget || new EventTarget();
    this.maxTaskRetries = options.maxTaskRetries ?? DEFAULTS.maxTaskRetries;
    this.startupTimeout = options.startupTimeout ?? DEFAULTS.startupTimeout;
    this.exitOnNoProposals = options.exitOnNoProposals ?? DEFAULTS.exitOnNoProposals;
    /**
     * If the user does not explicitly specify the maximum size of the aggregate pool, the value of maxParallelTask will be set.
     * This means that the pool will contain a maximum number of agreements ready for reuse equal to the maximum number of tasks executed simultaneously.
     * This will avoid the situation of keeping unused agreements and activities and, consequently, unnecessary costs.
     */
    // this.agreementMaxPoolSize = options.agreementMaxPoolSize ?? DEFAULTS.maxParallelTasks;
  }
}

/**
 * @internal
 */
export class TaskConfig {
  public readonly maxParallelTasks: number;
  public readonly taskRunningInterval: number;
  public readonly taskTimeout?: number;
  public readonly storageProvider?: StorageProvider;
  public readonly logger: Logger;

  constructor(options?: TaskServiceOptions) {
    this.maxParallelTasks = options?.maxParallelTasks || DEFAULTS.maxParallelTasks;
    this.taskRunningInterval = options?.taskRunningInterval || DEFAULTS.taskRunningInterval;
    this.taskTimeout = options?.taskTimeout;
    this.logger = options?.logger || defaultLogger("work", { disableAutoPrefix: true });
    this.storageProvider = options?.storageProvider;
  }
}
