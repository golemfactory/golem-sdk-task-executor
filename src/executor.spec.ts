import { instance, imock, when, anything, mock, verify, reset } from "@johanblumenberg/ts-mockito";
import { Task } from "./task";
import { TaskExecutor } from "./executor";
import { sleep } from "./utils";
import { TaskService } from "./service";
import { StatsService } from "./stats";
import { EventEmitter } from "eventemitter3";
import {
  MarketService,
  AgreementPoolService,
  PaymentService,
  GolemConfigError,
  GolemWorkError,
  WorkErrorCode,
  Yagna,
  Package,
  Activity,
  GftpStorageProvider,
  YagnaApi,
  Logger,
} from "@golem-sdk/golem-js";

// temporarily until the import in golem-js is fixed
import { Allocation } from "@golem-sdk/golem-js/dist/payment";
import { PaymentConfig } from "@golem-sdk/golem-js/dist/payment/config";
interface PaymentServiceEvents {
  error: (err: Error) => void;
}

jest.mock("./service");

const paymentServiceMock = mock(PaymentService);
const agreementPoolServiceMock = mock(AgreementPoolService);
const marketServiceMock = mock(MarketService);
const yagnaMock = mock(Yagna);
const yagnaApiMock = imock<YagnaApi>();
const packageMock = mock(Package);
const allocationMock = imock<Allocation>();
const gftpStorageProviderMock = mock(GftpStorageProvider);
const paymentEventsMock = mock<EventEmitter<PaymentServiceEvents>>(EventEmitter);
const activityMock = mock(Activity);
Package.getImageIdentifier = jest.fn();
Package.create = jest.fn();

const paymentService = instance(paymentServiceMock);
const agreementPoolService = instance(agreementPoolServiceMock);
const marketService = instance(marketServiceMock);
const yagna = instance(yagnaMock);
const yagnaApi = instance(yagnaApiMock);
const taskPackage = instance(packageMock);
const allocation = instance(allocationMock);
const gftpStorageProvider = instance(gftpStorageProviderMock);
const paymentEvents = instance(paymentEventsMock);
const paymentConfig = { payment: { network: "test", driver: "test" } } as PaymentConfig;
const statsServiceMock = mock(StatsService);
const taskServiceMock = mock(TaskService);
const statsService = instance(statsServiceMock);
const taskMock = mock(Task);
const taskService = instance(taskServiceMock);
const task = instance(taskMock);
const activity = instance(activityMock);

when(yagnaMock.getApi()).thenReturn(yagnaApi);
when(yagnaMock.connect()).thenResolve(anything());
when(yagnaMock.end()).thenResolve(anything());
when(paymentServiceMock.createAllocation()).thenResolve(allocation);
when(paymentServiceMock.run()).thenResolve(anything());
when(paymentServiceMock.end()).thenResolve(anything());
when(paymentServiceMock.events).thenReturn(paymentEvents);
when(paymentServiceMock.config).thenReturn(paymentConfig);
when(marketServiceMock.run(anything(), anything())).thenResolve(anything());
when(marketServiceMock.end()).thenResolve(anything());
when(agreementPoolServiceMock.run()).thenResolve(anything());
when(agreementPoolServiceMock.end()).thenResolve(anything());
when(statsServiceMock.run()).thenResolve(anything());
when(statsServiceMock.end()).thenResolve(anything());
when(statsServiceMock.getAllCosts()).thenReturn(anything());
when(statsServiceMock.getAllCostsSummary()).thenReturn([]);
when(statsServiceMock.getComputationTime()).thenReturn(anything());
when(gftpStorageProviderMock.init()).thenResolve(anything());
when(gftpStorageProviderMock.close()).thenResolve(anything());
when(taskServiceMock.run()).thenResolve(anything());
when(taskServiceMock.end()).thenResolve(anything());
when(taskMock.getActivity()).thenReturn(activity);
when(taskMock.getDetails()).thenReturn({ activityId: "1", agreementId: "1", id: "1", retriesCount: 0 });

jest.mock("@golem-sdk/golem-js", () => ({
  ...jest.requireActual("@golem-sdk/golem-js"),
  MarketService: jest.fn(() => marketService),
  PaymentService: jest.fn(() => paymentService),
  AgreementPoolService: jest.fn(() => agreementPoolService),
  Yagna: jest.fn(() => yagna),
  GftpStorageProvider: jest.fn(() => gftpStorageProvider),
  Package: jest.fn(() => taskPackage),
}));

jest.mock("./service", () => ({
  TaskService: jest.fn(() => taskService),
}));

jest.mock("./task", () => ({
  Task: jest.fn(() => task),
}));

jest.mock("./stats", () => ({
  StatsService: jest.fn(() => statsService),
}));

describe("Task Executor", () => {
  const loggerMock = imock<Logger>();
  const logger = instance(loggerMock);
  when(loggerMock.child(anything())).thenReturn(logger);
  const yagnaOptions = { apiKey: "test" };
  beforeEach(() => {
    reset(taskMock);
    jest.clearAllMocks();
    jest.spyOn(globalThis.console, "error").mockImplementation(jest.fn());
  });

  describe("init()", () => {
    it("should run all set services", async () => {
      const executor = await TaskExecutor.create({ package: "test", logger, yagnaOptions });
      verify(marketServiceMock.run(anything(), anything())).called();
      verify(agreementPoolServiceMock.run()).called();
      verify(paymentServiceMock.run()).called();
      verify(statsServiceMock.run()).called();
      expect(executor).toBeDefined();
      await executor.shutdown();
    });
    it("should handle a critical error if startup timeout is reached and exitOnNoProposals is enabled", async () => {
      const executor = await TaskExecutor.create({
        package: "test",
        startupTimeout: 0,
        exitOnNoProposals: true,
        logger,
        yagnaOptions,
      });
      when(marketServiceMock.getProposalsCount()).thenReturn({ confirmed: 0, initial: 0, rejected: 0 });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handleErrorSpy = jest.spyOn(executor as any, "handleCriticalError").mockImplementation((error) => {
        expect((error as Error).message).toEqual(
          "Could not start any work on Golem. Processed 0 initial proposals from yagna, filters accepted 0. Check your demand if it's not too restrictive or restart yagna.",
        );
      });
      await sleep(10, true);
      expect(handleErrorSpy).toHaveBeenCalled();
      await executor.shutdown();
    });

    it("should pass zero for the Task entity if the maxTaskRetires option is zero", async () => {
      const executor = await TaskExecutor.create({
        package: "test",
        maxTaskRetries: 0,
        logger,
        yagnaOptions,
      });
      when(taskMock.isQueueable()).thenReturn(true);
      when(taskMock.isFinished()).thenReturn(true);
      when(taskMock.isRejected()).thenReturn(false);
      when(taskMock.getResults()).thenReturn("result");

      const worker = () => Promise.resolve(true);
      await executor.run(worker);
      expect(Task).toHaveBeenCalledWith("1", worker, {
        activityReadySetupFunctions: [],
        maxRetries: 0,
        timeout: 300000,
      });
      await executor.shutdown();
    });

    it("should pass zero for the Task entity if the maxRetires params in run method is zero", async () => {
      const executor = await TaskExecutor.create({
        package: "test",
        maxTaskRetries: 7,
        logger,
        yagnaOptions,
      });
      when(taskMock.isQueueable()).thenReturn(true);
      when(taskMock.isFinished()).thenReturn(true);
      when(taskMock.isRejected()).thenReturn(false);
      when(taskMock.getResults()).thenReturn("result");

      const worker = () => Promise.resolve(true);
      await executor.run(worker, { maxRetries: 0 });
      expect(Task).toHaveBeenCalledWith("1", worker, {
        activityReadySetupFunctions: [],
        maxRetries: 0,
        timeout: 300000,
      });
      await executor.shutdown();
    });

    it("should throw an error if the value of maxTaskRetries is less than zero", async () => {
      const executorPromise = TaskExecutor.create({
        package: "test",
        maxTaskRetries: -1,
        logger,
        yagnaOptions,
      });
      await expect(executorPromise).rejects.toThrow(
        new GolemConfigError("The maxTaskRetries parameter cannot be less than zero"),
      );
    });

    it('should emit "ready" event after init() completes', async () => {
      const ready = jest.fn();
      const executor = new TaskExecutor({ package: "test", logger, yagnaOptions });
      executor.events.on("ready", ready);
      await executor.init();
      expect(ready).toHaveBeenCalledTimes(1);
      await executor.shutdown();
    });
  });

  describe("run()", () => {
    it("should run all tasks even if some fail", async () => {
      const executor = await TaskExecutor.create({ package: "test", logger, yagnaOptions });

      when(taskMock.isQueueable()).thenReturn(true);
      when(taskMock.isFinished()).thenReturn(true);
      when(taskMock.isRejected()).thenReturn(false).thenReturn(true).thenReturn(false);
      when(taskMock.getResults()).thenReturn("result 1").thenReturn("result 2");
      when(taskMock.getError()).thenReturn(new Error("error 1"));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const executorShutdownSpy = jest.spyOn(executor as any, "doShutdown");

      await expect(executor.run(() => Promise.resolve())).resolves.toEqual("result 1");
      await expect(executor.run(() => Promise.resolve())).rejects.toThrow(
        new GolemWorkError(
          "Unable to execute task. Error: error 1",
          WorkErrorCode.ScriptExecutionFailed,
          undefined,
          undefined,
          undefined,
          new Error("error 1"),
        ),
      );
      await expect(executor.run(() => Promise.resolve())).resolves.toEqual("result 2");
      verify(taskMock.isRejected()).times(3);
      verify(taskMock.getResults()).times(2);
      verify(taskMock.getError()).times(1);
      expect(executorShutdownSpy).toHaveBeenCalledTimes(0);

      await executor.shutdown();
    });

    it("should only warn the user if startup timeout is reached and exitOnNoProposals is disabled", async () => {
      const executor = await TaskExecutor.create({
        package: "test",
        startupTimeout: 10,
        exitOnNoProposals: false,
        logger,
        yagnaOptions,
      });
      when(marketServiceMock.getProposalsCount()).thenReturn({ confirmed: 0, initial: 0, rejected: 0 });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handleErrorSpy = jest.spyOn(executor as any, "handleCriticalError");
      const consoleErrorSpy = jest.spyOn(globalThis.console, "error").mockImplementation(() => {});

      await sleep(10, true);

      expect(handleErrorSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Could not start any work on Golem. Processed 0 initial proposals from yagna, filters accepted 0. Check your demand if it's not too restrictive or restart yagna.",
      );
      await executor.shutdown();
    });
  });

  describe("end()", () => {
    it("should call shutdown()", async () => {
      const executor = await TaskExecutor.create({ package: "test", startupTimeout: 0, logger, yagnaOptions });
      const spy = jest.spyOn(executor, "shutdown");
      await executor.shutdown();
      expect(spy).toHaveBeenCalled();
    });
  });

  describe("shutdown()", () => {
    it("should allow multiple calls", async () => {
      // Implementation details: the same promise is always used, so it's safe to call end() multiple times.
      const executor = await TaskExecutor.create({
        package: "test",
        logger,
        yagnaOptions,
      });
      const p = Promise.resolve();
      const originalDoShutdown = executor["doShutdown"].bind(executor);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const spy = jest.spyOn(executor as any, "doShutdown").mockReturnValue(p);

      const r1 = executor.shutdown();
      expect(r1).toBeDefined();
      expect(r1).toStrictEqual(p);

      const r2 = executor.shutdown();
      expect(r1).toStrictEqual(r2);

      await r1;

      const r3 = executor.shutdown();
      expect(r3).toStrictEqual(r1);
      expect(spy).toHaveBeenCalledTimes(1);
      await originalDoShutdown();
    });

    it('it should emit "beforeEnd" and "end" events', async () => {
      const executor = await TaskExecutor.create({
        package: "test",
        logger,
        yagnaOptions,
      });
      const beforeEnd = jest.fn();
      const end = jest.fn();

      executor.events.on("beforeEnd", beforeEnd);
      executor.events.on("end", end);

      await executor.shutdown();
      // Second call shouldn't generate new events.
      await executor.shutdown();

      // Both events should have been fired.
      expect(beforeEnd).toHaveBeenCalledTimes(1);
      expect(end).toHaveBeenCalledTimes(1);
    });
  });
});
