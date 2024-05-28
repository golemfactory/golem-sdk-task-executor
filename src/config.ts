import { ExecutorMainOptions, ExecutorOptionsMixin } from "./executor";
import {
  GolemConfigError,
  Logger,
  nullLogger,
  defaultLogger,
  GolemNetworkOptions,
  MarketOrderSpec,
  NetworkOptions,
} from "@golem-sdk/golem-js";

const DEFAULTS = Object.freeze({
  enableLogging: true,
  vpn: false,
  skipProcessSignals: false,
  maxParallelTasks: 5,
  maxTaskRetries: 3,
  taskRetryOnTimeout: false,
  dataTransferProtocol: "gftp",
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
  };
  readonly golem: GolemNetworkOptions;
  readonly order: MarketOrderSpec;
  readonly logger: Logger;
  readonly startupTimeout?: number;
  readonly vpn: boolean | NetworkOptions;
  readonly skipProcessSignals;

  constructor(options: ExecutorOptionsMixin) {
    const configOptions = (typeof options === "string" ? { package: options } : options) as ExecutorMainOptions &
      GolemNetworkOptions &
      MarketOrderSpec;
    if (configOptions.task?.maxTaskRetries && configOptions.task.maxTaskRetries < 0) {
      throw new GolemConfigError("The maxTaskRetries parameter cannot be less than zero");
    }
    this.task = {
      maxParallelTasks: configOptions.task?.maxParallelTasks ?? DEFAULTS.maxParallelTasks,
      taskRetryOnTimeout: configOptions.task?.taskRetryOnTimeout ?? DEFAULTS.taskRetryOnTimeout,
      maxTaskRetries: configOptions.task?.maxTaskRetries ?? DEFAULTS.maxTaskRetries,
      taskTimeout: configOptions.task?.taskTimeout,
      taskStartupTimeout: configOptions.task?.taskStartupTimeout,
    };
    this.startupTimeout = configOptions.startupTimeout;
    this.skipProcessSignals = configOptions.skipProcessSignals ?? DEFAULTS.skipProcessSignals;
    this.vpn = configOptions.vpn ?? DEFAULTS.vpn;
    this.logger = (() => {
      const isLoggingEnabled = configOptions.enableLogging ?? DEFAULTS.enableLogging;
      if (!isLoggingEnabled) return nullLogger();
      if (configOptions.logger) return configOptions.logger.child("task-executor");
      return defaultLogger("task-executor", { disableAutoPrefix: true });
    })();
    this.order = {
      market: configOptions.market,
      payment: configOptions.payment,
      activity: configOptions.activity,
      demand: configOptions.demand,
    };
    this.golem = {
      logger: this.logger,
      api: configOptions.api,
      payment: configOptions.payment,
      dataTransferProtocol: configOptions.dataTransferProtocol || DEFAULTS.dataTransferProtocol,
      override: configOptions.override,
    };
  }
}
