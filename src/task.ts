import { QueueableTask } from "./queue";
import {
  Activity,
  GolemConfigError,
  GolemInternalError,
  GolemTimeoutError,
  NetworkNode,
  Worker,
} from "@golem-sdk/golem-js";

export interface ProviderInfo {
  name: string;
  id: string;
  walletAddress: string;
}

export enum TaskState {
  New = "new",
  Queued = "queued",
  Pending = "pending",
  Done = "done",
  Retry = "retry",
  Rejected = "rejected",
}

export type TaskOptions = {
  /** maximum number of retries if task failed due to provider reason, default = 5 */
  maxRetries?: number;

  /**
   * Opt-in for retries of the tasks when the {@link TaskOptions.timeout} {@link TaskOptions.startupTimeout} are reached
   *
   * @default false
   */
  retryOnTimeout?: boolean;

  /** timeout in ms for task execution, measured for one attempt from start to stop, default = 300_000 (5min) */
  timeout?: number;

  /** timeout in ms for task startup, measured from initialization to start, default = 120_000 (2min) */
  startupTimeout?: number;

  /** array of setup functions to run on each activity */
  activityReadySetupFunctions?: Worker<unknown>[];
};

export type TaskDetails = {
  id: string;
  retriesCount: number;
  agreementId?: string;
  activityId?: string;
  provider?: ProviderInfo;
  error?: Error;
};

const DEFAULTS = {
  MAX_RETRIES: 5,
};

/**
 * One computation unit.
 *
 * @description Represents one computation unit that will be run on the one provider machine (e.g. rendering of one frame of an animation).
 */
export class Task<OutputType = unknown> implements QueueableTask {
  private state = TaskState.New;
  private results?: OutputType;
  private error?: Error;
  private retriesCount = 0;
  private retryOnTimeout;
  private listeners = new Set<(state: TaskState) => void>();
  private timeoutId?: NodeJS.Timeout;
  private startupTimeoutId?: NodeJS.Timeout;
  private readonly timeout?: number;
  private readonly startupTimeout?: number;
  private readonly maxRetries: number;
  private readonly activityReadySetupFunctions: Worker<unknown>[];
  private activity?: Activity;
  private networkNode?: NetworkNode;

  constructor(
    public readonly id: string,
    private worker: Worker<OutputType>,
    options?: TaskOptions,
  ) {
    this.timeout = options?.timeout;
    this.startupTimeout = options?.startupTimeout;
    this.maxRetries = options?.maxRetries ?? DEFAULTS.MAX_RETRIES;

    this.retryOnTimeout = options?.retryOnTimeout ?? false;

    this.activityReadySetupFunctions = options?.activityReadySetupFunctions ?? [];

    if (this.maxRetries < 0) {
      throw new GolemConfigError("The maxRetries parameter cannot be less than zero");
    }
  }
  onStateChange(listener: (state: TaskState) => void) {
    this.listeners.add(listener);
  }
  cleanup() {
    // prevent memory leaks
    this.listeners.clear();
  }
  init() {
    this.updateState(TaskState.Queued);
    if (this.startupTimeout) {
      this.startupTimeoutId = setTimeout(
        () =>
          this.stop(
            undefined,
            new GolemTimeoutError(
              `Task ${this.id} startup timeout. Failed to prepare the runtime environment within the specified time.`,
            ),
            this.retryOnTimeout,
          ),
        this.startupTimeout,
      );
    }
  }

  start(activity: Activity, networkNode?: NetworkNode) {
    if (this.state !== TaskState.Queued) {
      throw new GolemInternalError("You cannot start a task that is not queued");
    }
    this.updateState(TaskState.Pending);
    clearTimeout(this.startupTimeoutId);
    this.activity = activity;
    this.networkNode = networkNode;
    if (this.timeout) {
      this.timeoutId = setTimeout(
        () => this.stop(undefined, new GolemTimeoutError(`Task ${this.id} timeout.`), this.retryOnTimeout),
        this.timeout,
      );
    }
  }
  stop(results?: OutputType, error?: Error, retry = true) {
    if (this.isFinished() || this.isRetry()) {
      return;
    }
    clearTimeout(this.timeoutId);
    clearTimeout(this.startupTimeoutId);

    if (error) {
      this.error = error;
      if (retry && this.retriesCount < this.maxRetries) {
        this.updateState(TaskState.Retry);
        ++this.retriesCount;
      } else {
        this.updateState(TaskState.Rejected);
      }
    } else {
      this.updateState(TaskState.Done);
      this.results = results;
    }
  }
  isQueueable(): boolean {
    return this.state === TaskState.New || this.state === TaskState.Retry;
  }
  isRetry(): boolean {
    return this.state === TaskState.Retry;
  }
  isDone(): boolean {
    return this.state === TaskState.Done;
  }
  isFinished(): boolean {
    return this.state === TaskState.Done || this.state === TaskState.Rejected;
  }
  isRejected(): boolean {
    return this.state === TaskState.Rejected;
  }
  isQueued(): boolean {
    return this.state === TaskState.Queued;
  }
  isPending(): boolean {
    return this.state === TaskState.Pending;
  }
  isNew(): boolean {
    return this.state === TaskState.New;
  }
  isFailed(): boolean {
    return this.state === TaskState.Rejected || this.state === TaskState.Retry;
  }
  getResults(): OutputType | undefined {
    return this.results;
  }
  getWorker(): Worker<OutputType> {
    return this.worker;
  }
  getActivityReadySetupFunctions(): Worker<unknown>[] {
    return this.activityReadySetupFunctions;
  }
  getRetriesCount(): number {
    return this.retriesCount;
  }
  getError(): Error | undefined {
    return this.error;
  }
  getActivity(): Activity | undefined {
    return this.activity;
  }
  getNetworkNode(): NetworkNode | undefined {
    return this.networkNode;
  }
  getState(): TaskState {
    return this.state;
  }

  private updateState(newSate: TaskState) {
    this.state = newSate;
    this.listeners.forEach((listener) => listener(this.state));
  }

  getDetails(): TaskDetails {
    return {
      id: this.id,
      activityId: this.getActivity()?.id,
      agreementId: this.getActivity()?.agreement?.id,
      provider: this.getActivity()?.getProviderInfo(),
      retriesCount: this.getRetriesCount(),
      error: this.getError(),
    };
  }
}
