import { ProviderInfo, TaskDetails } from "./task";
import {
  ActivityEvents,
  Agreement,
  defaultLogger,
  Invoice,
  Logger,
  MarketEvents,
  OfferProposal,
  PaymentEvents,
} from "@golem-sdk/golem-js";
import { ExecutorEvents } from "./events";
import Decimal from "decimal.js-light";
import { EventEmitter } from "eventemitter3";

export interface TimeInfo {
  startTime?: number;
  stopTime?: number;
  duration?: number;
}

interface StatsServiceOptions {
  logger?: Logger;
}

export class StatsService {
  private tasksCompleted = new Map<string, TaskDetails[]>();
  private agreements = new Map<string, Agreement>();
  private providers = new Map<string, ProviderInfo>();
  private invoices = new Map<string, Invoice[]>();
  private payments = new Map<string, Invoice[]>();
  private proposals = new Set<OfferProposal>();
  private proposalsRejected = new Set<OfferProposal>();
  private timeInfo: TimeInfo = {};
  private logger: Logger;

  constructor(
    private executorEvents: EventEmitter<ExecutorEvents>,
    private golemEvents: {
      market: EventEmitter<MarketEvents>;
      activity: EventEmitter<ActivityEvents>;
      payment: EventEmitter<PaymentEvents>;
    },
    options?: StatsServiceOptions,
  ) {
    this.logger = options?.logger ? options?.logger.child("stats") : defaultLogger("stats");
  }
  async run() {
    this.subscribeEvents();
    this.logger.info("Stats Service has started");
  }

  async end() {
    this.logger.info("Task Service has stopped");
  }

  /**
   * Returns the sum of all costs generated by tasks in the total field, and the sum of all paid invoices in paid field
   */
  getAllCosts(): { total: string; paid: string } {
    let total = new Decimal(0);
    let paid = new Decimal(0);
    this.agreements.forEach((agreement) => {
      this.invoices.get(agreement.id)?.forEach((invoice) => (total = total.add(invoice.amount)));
      this.payments.get(agreement.id)?.forEach((invoice) => (paid = paid.add(invoice.amount)));
    });
    return {
      total: total.toString(),
      paid: paid.toString(),
    };
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
        Cost: invoices?.reduce((sum, invoice) => sum.add(invoice.amount), new Decimal(0)).toString(),
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

  private subscribeEvents() {
    this.executorEvents.on("executorReady", (timestamp: number) => {
      this.timeInfo.startTime = timestamp;
      this.logger.debug("Start time detected", { startTime: timestamp });
    });

    this.executorEvents.on("executorBeforeEnd", (timestamp: number) => {
      this.timeInfo.stopTime = timestamp;
      this.timeInfo.duration = this.timeInfo?.startTime ? this.timeInfo.stopTime - this.timeInfo.startTime : undefined;
      this.logger.debug("Stop time detected", { ...this.timeInfo });
    });

    this.executorEvents.on("taskCompleted", (task: TaskDetails) => {
      if (!task.agreementId) return;
      let tasks = this.tasksCompleted.get(task.agreementId);
      if (!tasks) {
        tasks = [];
        this.tasksCompleted.set(task.agreementId, tasks);
      }
      tasks.push(task);
      this.logger.debug("Task data collected", { task });
    });

    this.golemEvents.market.on("agreementApproved", ({ agreement }) => {
      const provider = agreement.provider;
      this.agreements.set(agreement.id, agreement);
      this.providers.set(provider.id, provider);
      this.logger.debug("AgreementApproved event collected", { agreement });
    });

    this.golemEvents.payment.on("invoiceReceived", (invoice) => {
      let invoices = this.invoices.get(invoice.agreementId);
      if (!invoices) {
        invoices = [];
        this.invoices.set(invoice.agreementId, invoices);
      }
      invoices.push(invoice);
      this.logger.debug("InvoiceReceived event collected", { invoice });
    });

    this.golemEvents.payment.on("invoiceAccepted", (invoice) => {
      let payments = this.payments.get(invoice.agreementId);
      if (!payments) {
        payments = [];
        this.payments.set(invoice.agreementId, payments);
      }
      payments.push(invoice);
      this.logger.debug("InvoiceAccepted event collected", { invoice });
    });

    this.golemEvents.market.on("offerProposalReceived", ({ proposal }) => {
      this.proposals.add(proposal);
    });
    this.golemEvents.market.on("offerProposalRejectedByProposalFilter", (proposal) => {
      this.proposalsRejected.add(proposal);
    });
    this.golemEvents.market.on("offerProposalRejectedByPriceFilter", (proposal) => {
      this.proposalsRejected.add(proposal);
    });
  }

  getAll() {
    return {
      providers: this.providers.size,
      agreements: this.agreements.size,
      invoicesReceived: this.invoices.size,
      invoicesPaid: this.payments.size,
      invoicesUnpaid: this.invoices.size - this.payments.size,
      invoicesMissing: this.agreements.size - this.invoices.size,
      invoicePaymentRate: this.payments.size / this.agreements.size,
    };
  }

  getProposalsCount(): { confirmed: number; initial: number; rejected: number } {
    const proposals = [...this.proposals.values()];
    return {
      confirmed: proposals.filter((proposal) => proposal.isDraft()).length,
      initial: proposals.filter((proposal) => proposal.isInitial()).length,
      rejected: this.proposalsRejected.size,
    };
  }
}
