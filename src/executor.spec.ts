import { _, imock, instance, mock, reset, verify, when } from "@johanblumenberg/ts-mockito";
import { Task } from "./task";
import { TaskExecutor } from "./executor";
import { sleep } from "./utils";
import { TaskService } from "./service";
import { StatsService } from "./stats";
import {
  ActivityModule,
  GolemConfigError,
  GolemNetwork,
  GolemWorkError,
  ResourceRental,
  ResourceRentalPool,
  Logger,
  MarketModule,
  NetworkModule,
  PaymentModule,
  WorkErrorCode,
} from "@golem-sdk/golem-js";
import { randomUUID } from "node:crypto";

jest.mock("./service");

const golemNetworkMock = mock(GolemNetwork);
const resourceRentalPoolMock = mock(ResourceRentalPool);
const resourceRentalMock = mock(ResourceRental);
const golemNetwork = instance(golemNetworkMock);
const resourceRentalPool = instance(resourceRentalPoolMock);
const resourceRental = instance(resourceRentalMock);
const statsServiceMock = mock(StatsService);
const taskServiceMock = mock(TaskService);
const statsService = instance(statsServiceMock);
const taskMock = mock(Task);
const taskService = instance(taskServiceMock);
const task = instance(taskMock);

when(golemNetworkMock.connect()).thenResolve();
when(golemNetworkMock.disconnect()).thenResolve();
when(golemNetworkMock.manyOf(_)).thenResolve(resourceRentalPool);
when(golemNetworkMock.market).thenReturn(instance(imock<MarketModule>()));
when(golemNetworkMock.activity).thenReturn(instance(imock<ActivityModule>()));
when(golemNetworkMock.payment).thenReturn(instance(imock<PaymentModule>()));
when(golemNetworkMock.network).thenReturn(instance(imock<NetworkModule>()));
when(resourceRentalPoolMock.acquire(_)).thenResolve(resourceRental);
when(statsServiceMock.run()).thenResolve();
when(statsServiceMock.end()).thenResolve();
when(statsServiceMock.getAllCosts()).thenReturn(_);
when(statsServiceMock.getAllCostsSummary()).thenReturn([]);
when(statsServiceMock.getComputationTime()).thenReturn(_);
when(taskServiceMock.run()).thenResolve(_);
when(taskServiceMock.end()).thenResolve(_);
when(taskMock.getDetails()).thenReturn({ activityId: "1", agreementId: "1", id: "1", retriesCount: 0 });
when(taskMock.id).thenCall(randomUUID);

jest.mock("@golem-sdk/golem-js", () => ({
  ...jest.requireActual("@golem-sdk/golem-js"),
  GolemNetwork: jest.fn(() => golemNetwork),
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
  when(loggerMock.child(_)).thenReturn(logger);
  beforeEach(() => {
    reset(taskMock);
    jest.clearAllMocks();
    jest.spyOn(globalThis.console, "error").mockImplementation(jest.fn());
  });

  describe("init()", () => {
    it("should run all set services", async () => {
      const executor = await TaskExecutor.create({
        demand: {
          workload: {
            imageTag: "golem/alpine:latest",
          },
        },
        market: {
          rentHours: 0.5,
          pricing: {
            model: "linear",
            maxStartPrice: 0.5,
            maxCpuPerHourPrice: 1.0,
            maxEnvPerHourPrice: 0.5,
          },
        },
      });
      verify(golemNetworkMock.connect()).called();
      verify(statsServiceMock.run()).called();
      expect(executor).toBeDefined();
      await executor.shutdown();
    });
    it("should handle a critical error if startup timeout is reached", async () => {
      const executor = await TaskExecutor.create({
        demand: {
          workload: {
            imageTag: "golem/alpine:latest",
          },
        },
        market: {
          rentHours: 0.5,
          pricing: {
            model: "linear",
            maxStartPrice: 0.5,
            maxCpuPerHourPrice: 1.0,
            maxEnvPerHourPrice: 0.5,
          },
        },
        startupTimeout: 1,
      });
      when(statsServiceMock.getProposalsCount()).thenReturn({ confirmed: 0, initial: 0, rejected: 0 });
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
        task: {
          maxTaskRetries: 0,
        },
        demand: {
          workload: {
            imageTag: "golem/alpine:latest",
          },
        },
        market: {
          rentHours: 0.5,
          pricing: {
            model: "linear",
            maxStartPrice: 0.5,
            maxCpuPerHourPrice: 1.0,
            maxEnvPerHourPrice: 0.5,
          },
        },
      });
      when(taskMock.isQueueable()).thenReturn(true);
      when(taskMock.isFinished()).thenReturn(true);
      when(taskMock.isRejected()).thenReturn(false);
      when(taskMock.getResults()).thenReturn("result");

      const taskFunction = () => Promise.resolve(true);
      await executor.run(taskFunction);
      expect(Task).toHaveBeenCalledWith("1", taskFunction, {
        maxRetries: 0,
        retryOnTimeout: false,
      });
      await executor.shutdown();
    });

    it("should pass zero for the Task entity if the maxRetires params in run method is zero", async () => {
      const executor = await TaskExecutor.create({
        demand: {
          workload: {
            imageTag: "golem/alpine:latest",
          },
        },
        market: {
          rentHours: 0.5,
          pricing: {
            model: "linear",
            maxStartPrice: 0.5,
            maxCpuPerHourPrice: 1.0,
            maxEnvPerHourPrice: 0.5,
          },
        },
      });
      when(taskMock.isQueueable()).thenReturn(true);
      when(taskMock.isFinished()).thenReturn(true);
      when(taskMock.isRejected()).thenReturn(false);
      when(taskMock.getResults()).thenReturn("result");

      const taskFunction = () => Promise.resolve(true);
      await executor.run(taskFunction, { maxRetries: 0 });
      expect(Task).toHaveBeenCalledWith("1", taskFunction, {
        maxRetries: 0,
        retryOnTimeout: false,
      });
      await executor.shutdown();
    });

    it("should throw an error if the value of maxTaskRetries is less than zero", async () => {
      const executorPromise = TaskExecutor.create({
        task: {
          maxTaskRetries: -1,
        },
        demand: {
          workload: {
            imageTag: "golem/alpine:latest",
          },
        },
        market: {
          rentHours: 0.5,
          pricing: {
            model: "linear",
            maxStartPrice: 0.5,
            maxCpuPerHourPrice: 1.0,
            maxEnvPerHourPrice: 0.5,
          },
        },
      });
      await expect(executorPromise).rejects.toThrow(
        new GolemConfigError("The maxTaskRetries parameter cannot be less than zero"),
      );
    });

    it('should emit "ready" event after init() completes', async () => {
      const ready = jest.fn();
      const executor = new TaskExecutor({
        demand: {
          workload: {
            imageTag: "golem/alpine:latest",
          },
        },
        market: {
          rentHours: 0.5,
          pricing: {
            model: "linear",
            maxStartPrice: 0.5,
            maxCpuPerHourPrice: 1.0,
            maxEnvPerHourPrice: 0.5,
          },
        },
      });
      executor.events.on("executorReady", ready);
      await executor.init();
      expect(ready).toHaveBeenCalledTimes(1);
      await executor.shutdown();
    });
  });

  describe("run()", () => {
    it("should run all tasks even if some fail", async () => {
      const executor = await TaskExecutor.create({
        demand: {
          workload: {
            imageTag: "golem/alpine:latest",
          },
        },
        market: {
          rentHours: 0.5,
          pricing: {
            model: "linear",
            maxStartPrice: 0.5,
            maxCpuPerHourPrice: 1.0,
            maxEnvPerHourPrice: 0.5,
          },
        },
      });

      when(taskMock.getResourceRental()).thenReturn(instance(mock(ResourceRental)));
      when(taskMock.isQueueable()).thenReturn(true);
      when(taskMock.isFinished()).thenReturn(true);
      when(taskMock.isRejected()).thenReturn(false).thenReturn(true).thenReturn(false);
      when(taskMock.getResults()).thenReturn("result 1").thenReturn("result 2");
      when(taskMock.getError()).thenReturn(new Error("error 1"));
      when(taskMock.id).thenCall(randomUUID);
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
  });

  describe("end()", () => {
    it("should call shutdown()", async () => {
      const executor = await TaskExecutor.create({
        startupTimeout: 0,
        demand: {
          workload: {
            imageTag: "golem/alpine:latest",
          },
        },
        market: {
          rentHours: 0.5,
          pricing: {
            model: "linear",
            maxStartPrice: 0.5,
            maxCpuPerHourPrice: 1.0,
            maxEnvPerHourPrice: 0.5,
          },
        },
      });
      const spy = jest.spyOn(executor, "shutdown");
      await executor.shutdown();
      expect(spy).toHaveBeenCalled();
    });
  });

  describe("shutdown()", () => {
    it("should allow multiple calls", async () => {
      // Implementation details: the same promise is always used, so it's safe to call end() multiple times.
      const executor = await TaskExecutor.create({
        demand: {
          workload: {
            imageTag: "golem/alpine:latest",
          },
        },
        market: {
          rentHours: 0.5,
          pricing: {
            model: "linear",
            maxStartPrice: 0.5,
            maxCpuPerHourPrice: 1.0,
            maxEnvPerHourPrice: 0.5,
          },
        },
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
        demand: {
          workload: {
            imageTag: "golem/alpine:latest",
          },
        },
        market: {
          rentHours: 0.5,
          pricing: {
            model: "linear",
            maxStartPrice: 0.5,
            maxCpuPerHourPrice: 1.0,
            maxEnvPerHourPrice: 0.5,
          },
        },
      });
      const beforeEnd = jest.fn();
      const end = jest.fn();

      executor.events.on("executorBeforeEnd", beforeEnd);
      executor.events.on("executorEnd", end);

      await executor.shutdown();
      // Second call shouldn't generate new events.
      await executor.shutdown();

      // Both events should have been fired.
      expect(beforeEnd).toHaveBeenCalledTimes(1);
      expect(end).toHaveBeenCalledTimes(1);
    });
  });
});
