import { StatsService } from "./stats";
import { EventEmitter } from "eventemitter3";
// import { Events } from "@golem-sdk/golem-js";
import { sleep } from "./utils";
import { TaskExecutorEvents } from "./executor";
import { ExecutorEvents, TaskEvents } from "./events";
import { ActivityEvents, MarketEvents, NetworkEvents, PaymentEvents } from "@golem-sdk/golem-js";

// TODO: when we implement events in golem-js
describe.skip("Stats Service", function () {
  const events: TaskExecutorEvents = {
    executor: new EventEmitter<ExecutorEvents>(),
    task: new EventEmitter<TaskEvents>(),
    market: new EventEmitter<MarketEvents>(),
    activity: new EventEmitter<ActivityEvents>(),
    payment: new EventEmitter<PaymentEvents>(),
    network: new EventEmitter<NetworkEvents>(),
  };
  const emitEvents = async (
    tasks: Array<{
      invoiceReceivedAmount: number | null;
      paid: number | null;
      providerName?: string;
      agreementId?: string;
    }>,
  ) => {
    events.executor.emit("ready", Date.now());
    for (const task of tasks) {
      const id = Math.random();
      const provider = {
        id: `test-provider-id-${id}`,
        name: task.providerName ?? "test-provider-name",
        walletAddress: "0x111111111",
      };
      // events.emit(
      //   "golemEvents",
      //   new Events.AgreementCreated({
      //     id: task.agreementId ?? `test-agreement-id-${id}`,
      //     provider,
      //     proposalId: `test-proposal-id-${id}`,
      //   }),
      // );
      if (task.invoiceReceivedAmount) {
        // events.emit(
        //   "golemEvents",
        //   new Events.InvoiceReceived({
        //     id: `test-invoice-id-${id}`,
        //     agreementId: task.agreementId ?? `test-agreement-id-${id}`,
        //     provider,
        //     amount: task.invoiceReceivedAmount,
        //   }),
        // );
      }
      if (task.paid) {
        // events.emit(
        //   "golemEvents",
        //   // new Events.PaymentAccepted({
        //   //   id: `test-invoice-id-${id}`,
        //   //   agreementId: task.agreementId ?? `test-agreement-id-${id}`,
        //   //   provider,
        //   //   amount: task.paid,
        //   // }),
        // );
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
    events.executor.emit("beforeEnd", Date.now());
  };

  describe("All costs", () => {
    it("should get all costs", async () => {
      const statsService = new StatsService(events);
      await statsService.run();
      await emitEvents([
        { invoiceReceivedAmount: 7.77, paid: 7.77 },
        { invoiceReceivedAmount: 8.88, paid: 8.88 },
      ]);
      expect(statsService.getAllCosts()).toEqual({ paid: 8.88 + 7.77, total: 8.88 + 7.77 });
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
      expect(statsService.getAllCosts()).toEqual({ total: 8.88 + 7.77 + 9.99, paid: 7.77 + 8.88 });
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
          Cost: invoiceReceivedAmount,
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
          Cost: invoiceReceivedAmount,
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
          Cost: 7.77 + 8.88 + 9.99,
          "Payment Status": "paid",
        },
        {
          Agreement: "id-4",
          "Provider Name": "test-provider-name",
          "Task Computed": 1,
          Cost: 5.55,
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
          Cost: 7.77 + 8.88 + 9.99,
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
