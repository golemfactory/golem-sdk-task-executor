import { ExecutorMainOptions, TaskExecutorOptions } from "./executor";
import {
  GolemConfigError,
  Logger,
  nullLogger,
  defaultLogger,
  GolemNetworkOptions,
  MarketOrderSpec,
  NetworkOptions,
  LifecycleFunction,
} from "@golem-sdk/golem-js";

const DEFAULTS = Object.freeze({
  enableLogging: true,
  vpn: false,
  skipProcessSignals: false,
  maxParallelTasks: 5,
  maxTaskRetries: 3,
  taskRetryOnTimeout: false,
});

/**
 * @internal
 */
export class ExecutorConfig implements ExecutorMainOptions {
  readonly task: {
    maxParallelTasks: number;
    taskRetryOnTimeout: boolean;
    maxTaskRetries: number;
    taskTimeout?: number;
    taskStartupTimeout?: number;
    setup?: LifecycleFunction;
    teardown?: LifecycleFunction;
  };
  readonly golemNetwork: GolemNetworkOptions;
  readonly order: MarketOrderSpec;
  readonly logger: Logger;
  readonly startupTimeout?: number;
  readonly vpn: boolean | NetworkOptions;
  readonly skipProcessSignals;

  constructor(options: TaskExecutorOptions) {
    if (options.task?.maxTaskRetries && options.task.maxTaskRetries < 0) {
      throw new GolemConfigError("The maxTaskRetries parameter cannot be less than zero");
    }
    this.task = {
      maxParallelTasks: options.task?.maxParallelTasks ?? DEFAULTS.maxParallelTasks,
      taskRetryOnTimeout: options.task?.taskRetryOnTimeout ?? DEFAULTS.taskRetryOnTimeout,
      maxTaskRetries: options.task?.maxTaskRetries ?? DEFAULTS.maxTaskRetries,
      taskTimeout: options.task?.taskTimeout,
      taskStartupTimeout: options.task?.taskStartupTimeout,
      setup: options.task?.setup,
      teardown: options.task?.teardown,
    };
    this.startupTimeout = options.startupTimeout;
    this.skipProcessSignals = options.skipProcessSignals ?? DEFAULTS.skipProcessSignals;
    this.vpn = options.vpn ?? DEFAULTS.vpn;
    this.logger = (() => {
      const isLoggingEnabled = options.enableLogging ?? DEFAULTS.enableLogging;
      if (!isLoggingEnabled) return nullLogger();
      if (options.logger) return options.logger.child("task-executor");
      return defaultLogger("task-executor", { disableAutoPrefix: true });
    })();
    this.order = {
      market: options.market,
      payment: options.payment,
      activity: options.activity,
      demand: options.demand,
    };
    this.golemNetwork = {
      logger: this.logger,
      api: options.api,
      payment: options.payment,
      override: options.override,
    };
    if (options.dataTransferProtocol) {
      this.golemNetwork.dataTransferProtocol = options.dataTransferProtocol;
    }
  }
}
