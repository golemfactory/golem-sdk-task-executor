import { StatsService } from "./stats";
import { EventEmitter } from "eventemitter3";
import { sleep } from "./utils";
import { ExecutorEvents, TaskEvents } from "./events";
import { TaskExecutorEvents } from "./executor";
import { ActivityEvents, MarketEvents, NetworkEvents, PaymentEvents, Agreement, Invoice } from "@golem-sdk/golem-js";
import { instance, mock, when } from "@johanblumenberg/ts-mockito";

describe("Stats Service", function () {
  const executorEvents = new EventEmitter<ExecutorEvents>();
  const events: TaskExecutorEvents = Object.assign(executorEvents, {
    task: new EventEmitter<TaskEvents>(),
    market: new EventEmitter<MarketEvents>(),
    activity: new EventEmitter<ActivityEvents>(),
    payment: new EventEmitter<PaymentEvents>(),
    network: new EventEmitter<NetworkEvents>(),
  });
  const emitEvents = async (
    tasks: Array<{
      invoiceReceivedAmount: number | null;
      paid: number | null;
      providerName?: string;
      agreementId?: string;
    }>,
  ) => {
    events.emit("executorReady", Date.now());
    for (const task of tasks) {
      const id = Math.random();
      const provider = {
        id: `test-provider-id-${id}`,
        name: task.providerName ?? "test-provider-name",
        walletAddress: "0x111111111",
      };
      const mockAgreement = mock(Agreement);
      when(mockAgreement.id).thenReturn(task.agreementId ?? `test-agreement-id-${id}`);
      when(mockAgreement.provider).thenReturn(provider);
      events.market.emit("agreementApproved", {
        type: "AgreementApproved",
        agreement: instance(mockAgreement),
        timestamp: new Date(),
      });
      if (task.invoiceReceivedAmount) {
        const mockInvoice = mock(Invoice);
        when(mockInvoice.provider).thenReturn(provider);
        when(mockInvoice.id).thenReturn(`test-invoice-id-${id}`);
        when(mockInvoice.agreementId).thenReturn(task.agreementId ?? `test-agreement-id-${id}`);
        when(mockInvoice.amount).thenReturn(task.invoiceReceivedAmount.toString());
        events.payment.emit("invoiceReceived", instance(mockInvoice));
      }
      if (task.paid) {
        const mockPaidInvoice = mock(Invoice);
        when(mockPaidInvoice.provider).thenReturn(provider);
        when(mockPaidInvoice.id).thenReturn(`test-invoice-id-${id}`);
        when(mockPaidInvoice.agreementId).thenReturn(task.agreementId ?? `test-agreement-id-${id}`);
        when(mockPaidInvoice.amount).thenReturn(task.paid.toString());
        events.payment.emit("invoiceAccepted", instance(mockPaidInvoice));
      }
      events.task.emit("taskCompleted", {
        id: `task-id-${id}`,
        agreementId: task.agreementId ?? `test-agreement-id-${id}`,
        retriesCount: 0,
        provider,
      });

      // simulate the time gap between executing tasks / emitting events
      await sleep(100, true);
    }
    events.emit("executorBeforeEnd", Date.now());
  };

  describe("All costs", () => {
    it("should get all costs", async () => {
      const statsService = new StatsService(events);
      await statsService.run();
      await emitEvents([
        { invoiceReceivedAmount: 7.77, paid: 7.77 },
        { invoiceReceivedAmount: 8.88, paid: 8.88 },
      ]);
      expect(statsService.getAllCosts()).toEqual({ paid: (8.88 + 7.77).toString(), total: (8.88 + 7.77).toString() });
      await statsService.end();
    });

    it("should get all costs included unpaid tasks", async () => {
      const statsService = new StatsService(events);
      await statsService.run();
      await emitEvents([
        { invoiceReceivedAmount: 7.77, paid: 7.77 },
        { invoiceReceivedAmount: 8.88, paid: 8.88 },
        { invoiceReceivedAmount: 9.99, paid: null },
      ]);
      expect(statsService.getAllCosts()).toEqual({
        total: (8.88 + 7.77 + 9.99).toString(),
        paid: (7.77 + 8.88).toString(),
      });
      await statsService.end();
    });
  });

  describe("Summary costs", () => {
    it("should get summary costs", async () => {
      const statsService = new StatsService(events);
      await statsService.run();
      const tasks = [
        { invoiceReceivedAmount: 7.77, paid: 7.77 },
        { invoiceReceivedAmount: 8.88, paid: 8.88 },
      ];
      await emitEvents(tasks);
      expect(statsService.getAllCostsSummary()).toEqual(
        tasks.map(({ invoiceReceivedAmount, paid }) => ({
          Agreement: "test-agree",
          "Provider Name": "test-provider-name",
          "Task Computed": 1,
          Cost: invoiceReceivedAmount.toString(),
          "Payment Status": paid ? "paid" : "unpaid",
        })),
      );
      await statsService.end();
    });

    it("should get summary costs included unpaid tasks", async () => {
      const statsService = new StatsService(events);
      await statsService.run();
      const tasks = [
        { agreementId: "id-1", providerName: "provider-1", invoiceReceivedAmount: 7.77, paid: 7.77 },
        { agreementId: "id-2", providerName: "provider-2", invoiceReceivedAmount: 8.88, paid: 8.88 },
        { agreementId: "id-3", providerName: "provider-3", invoiceReceivedAmount: 9.99, paid: null },
        { agreementId: "id-4", providerName: "provider-4", invoiceReceivedAmount: 5.55, paid: null },
      ];
      await emitEvents(tasks);
      expect(statsService.getAllCostsSummary()).toEqual(
        tasks.map(({ invoiceReceivedAmount, paid, providerName, agreementId }) => ({
          Agreement: agreementId,
          "Provider Name": providerName,
          "Task Computed": 1,
          Cost: invoiceReceivedAmount.toString(),
          "Payment Status": paid ? "paid" : "unpaid",
        })),
      );
      await statsService.end();
    });

    it("should get summary costs included task computed using the same agreement", async () => {
      const statsService = new StatsService(events);
      await statsService.run();
      const tasks = [
        { agreementId: "id-1", invoiceReceivedAmount: 7.77, paid: 7.77 },
        { agreementId: "id-1", invoiceReceivedAmount: 8.88, paid: 8.88 },
        { agreementId: "id-1", invoiceReceivedAmount: 9.99, paid: 9.99 },
        { agreementId: "id-4", invoiceReceivedAmount: 5.55, paid: null },
      ];
      await emitEvents(tasks);
      expect(statsService.getAllCostsSummary()).toEqual([
        {
          Agreement: "id-1",
          "Provider Name": "test-provider-name",
          "Task Computed": 3,
          Cost: (7.77 + 8.88 + 9.99).toString(),
          "Payment Status": "paid",
        },
        {
          Agreement: "id-4",
          "Provider Name": "test-provider-name",
          "Task Computed": 1,
          Cost: (5.55).toString(),
          "Payment Status": "unpaid",
        },
      ]);
      await statsService.end();
    });

    it("should get summary costs included task computed using the same agreement and partially paid", async () => {
      const statsService = new StatsService(events);
      await statsService.run();
      const tasks = [
        { agreementId: "id-1", invoiceReceivedAmount: 7.77, paid: 7.77 },
        { agreementId: "id-1", invoiceReceivedAmount: 8.88, paid: null },
        { agreementId: "id-1", invoiceReceivedAmount: 9.99, paid: 9.99 },
      ];
      await emitEvents(tasks);
      expect(statsService.getAllCostsSummary()).toEqual([
        {
          Agreement: "id-1",
          "Provider Name": "test-provider-name",
          "Task Computed": 3,
          Cost: (7.77 + 8.88 + 9.99).toString(),
          "Payment Status": "partially-paid",
        },
      ]);
      await statsService.end();
    });
  });

  describe("Computation time", () => {
    it("should get computation time", async () => {
      const statsService = new StatsService(events);
      await statsService.run();
      await emitEvents([
        { invoiceReceivedAmount: 7.77, paid: 7.77 },
        { invoiceReceivedAmount: 8.88, paid: 8.88 },
      ]);
      expect(statsService.getComputationTime()).toBeGreaterThan(0);
      await statsService.end();
    });
  });
});
