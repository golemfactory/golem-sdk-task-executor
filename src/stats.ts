import { EventEmitter } from "eventemitter3";
import { TaskExecutorEventsDict } from "./events";
import { ProviderInfo, TaskDetails } from "./task";
import { BaseEvent, defaultLogger, Events as GolemEvents, Logger } from "@golem-sdk/golem-js";

export interface AgreementInfo {
  id: string;
  proposalId: string;
  provider: ProviderInfo;
}

export interface InvoiceInfo {
  id: string;
  amount: number;
  provider: ProviderInfo;
}

export interface PaymentInfo extends InvoiceInfo {}

export interface TimeInfo {
  startTime?: number;
  stopTime?: number;
  duration?: number;
}

interface StatsServiceOptions {
  logger?: Logger;
}

export class StatsService {
  private listeners = new Map<keyof TaskExecutorEventsDict, EventEmitter.EventListener<string, string>>();
  private tasksCompleted = new Map<string, TaskDetails[]>();
  private agreements = new Map<string, AgreementInfo>();
  private providers = new Map<string, ProviderInfo>();
  private invoices = new Map<string, InvoiceInfo[]>();
  private payments = new Map<string, PaymentInfo[]>();
  private timeInfo: TimeInfo = {};
  private logger: Logger;

  constructor(
    private events: EventEmitter<TaskExecutorEventsDict>,
    options?: StatsServiceOptions,
  ) {
    this.logger = options?.logger || defaultLogger("stats");
  }
  async run() {
    this.subscribeGolemEvents();
    this.subscribeTaskEvents();
    this.subscribeTimeEvents();
    this.logger.info("Stats Service has started");
  }

  async end() {
    this.unsubscribeAllEvents();
    this.logger.info("Task Service has stopped");
  }

  /**
   * Returns the sum of all costs generated by tasks in the total field, and the sum of all paid invoices in paid field
   */
  getAllCosts(): { total: number; paid: number } {
    const costs = { total: 0, paid: 0 };
    this.agreements.forEach((agreement) => {
      const invoices = this.invoices.get(agreement.id);
      const payments = this.payments.get(agreement.id);
      costs.total += invoices?.reduce((sum, invoice) => sum + invoice.amount, 0) ?? 0;
      costs.paid += payments?.reduce((sum, invoice) => sum + invoice.amount, 0) ?? 0;
    });
    return costs;
  }

  /**
   * Returns an array of agreements and the number of tasks performed on them,
   * as well as total costs and payment status
   */
  getAllCostsSummary() {
    return [...this.agreements.values()].map((agreement) => {
      const provider = this.providers.get(agreement.provider.id);
      const invoices = this.invoices.get(agreement.id);
      const payments = this.payments.get(agreement.id);
      const tasks = this.tasksCompleted.get(agreement.id);
      return {
        Agreement: agreement.id.substring(0, 10),
        "Provider Name": provider ? provider.name : "unknown",
        "Task Computed": tasks?.length ?? 0,
        Cost: invoices?.reduce((sum, invoice) => sum + invoice.amount, 0),
        "Payment Status": payments?.length
          ? payments.length === invoices?.length
            ? "paid"
            : "partially-paid"
          : "unpaid",
      };
    });
  }

  /**
   * Returns the total computation time (in ms) of all tasks
   */
  getComputationTime(): number {
    return this.timeInfo?.duration ?? 0;
  }

  private subscribeTimeEvents() {
    const startTimeListener = (timestamp: number) => {
      this.timeInfo.startTime = timestamp;
      this.logger.debug("Start time detected", { startTime: timestamp });
    };
    this.events.on("ready", startTimeListener);
    this.listeners.set("ready", startTimeListener);

    const stopTimeListener = (timestamp: number) => {
      this.timeInfo.stopTime = timestamp;
      this.timeInfo.duration = this.timeInfo?.startTime ? this.timeInfo.stopTime - this.timeInfo.startTime : undefined;
      this.logger.debug("Stop time detected", { ...this.timeInfo });
    };
    this.events.on("beforeEnd", stopTimeListener);
    this.listeners.set("beforeEnd", stopTimeListener);
  }

  private subscribeTaskEvents() {
    const taskListener = (task: TaskDetails) => {
      if (!task.agreementId) return;
      let tasks = this.tasksCompleted.get(task.agreementId);
      if (!tasks) {
        tasks = [];
        this.tasksCompleted.set(task.agreementId, tasks);
      }
      tasks.push(task);
      this.logger.debug("Task data collected", { task });
    };
    this.events.on("taskCompleted", taskListener);
    this.listeners.set("taskCompleted", taskListener);
  }

  private subscribeGolemEvents() {
    const golemEventsListener = (event: BaseEvent<unknown>) => {
      if (event instanceof GolemEvents.AgreementCreated) {
        this.agreements.set(event.detail.id, {
          id: event.detail.id,
          provider: event.detail.provider,
          proposalId: event.detail.proposalId,
        });
        this.providers.set(event.detail.provider.id, event.detail.provider);
        this.logger.debug("AgreementCreated event collected", { agreement: event.detail });
      } else if (event instanceof GolemEvents.InvoiceReceived) {
        let invoices = this.invoices.get(event.detail.agreementId);
        if (!invoices) {
          invoices = [];
          this.invoices.set(event.detail.agreementId, invoices);
        }
        invoices.push(event.detail);
        this.logger.debug("InvoiceReceived event collected", { agreement: event.detail });
      } else if (event instanceof GolemEvents.PaymentAccepted) {
        let payments = this.payments.get(event.detail.agreementId);
        if (!payments) {
          payments = [];
          this.payments.set(event.detail.agreementId, payments);
        }
        payments.push(event.detail);
        this.logger.debug("InvoiceAccepted event collected", { agreement: event.detail });
      }
    };
    this.events.on("golemEvents", golemEventsListener);
    this.listeners.set("golemEvents", golemEventsListener);
  }

  private unsubscribeAllEvents() {
    this.listeners.forEach((listener, event) => this.events.removeListener(event, listener));
  }
}