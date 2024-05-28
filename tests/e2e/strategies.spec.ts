import { TaskExecutor } from "../../src";
import { sleep } from "../../src/utils";

describe.skip("Strategies", function () {
  describe("Proposals", () => {
    it("should filtered providers by black list names", async () => {
      const executor = await TaskExecutor.create({
        demand: {
          workload: {
            imageTag: "golem/alpine:latest",
          },
        },
        market: {
          maxAgreements: 1,
          rentHours: 0.5,
          pricing: {
            model: "linear",
            maxStartPrice: 0.5,
            maxCpuPerHourPrice: 1.0,
            maxEnvPerHourPrice: 0.5,
          },
          // proposalFilter: ProposalFilterFactory.disallowProvidersByNameRegex(/provider-2/),
        },
      });
      let proposalReceivedProviderNames: string[] = [];
      const taskCompletedIds: string[] = [];
      executor.events.on("taskCompleted", (details) => taskCompletedIds.push(details.id));
      // TODO
      // executor.events.on("golemEvents", (event) => {
      //   if (event.name === Events.ProposalResponded.name) {
      //     proposalReceivedProviderNames.push((event as Events.ProposalResponded).detail.provider.name);
      //   }
      // });
      const data = ["one", "two", "three"];
      const futureResults = data.map((x) =>
        executor.run(async (ctx) => {
          const res = await ctx.run(`echo "${x}"`);
          return res.stdout?.toString().trim();
        }),
      );
      const finalOutputs = (await Promise.all(futureResults)).filter((x) => !!x);
      expect(finalOutputs).toEqual(expect.arrayContaining(data));
      await sleep(5);
      expect(proposalReceivedProviderNames).not.toContain("provider-2");
      expect(taskCompletedIds).toEqual(expect.arrayContaining(["1", "2", "3"]));
      await executor.shutdown();
    });

    it("should filtered providers by white list names", async () => {
      const executor = await TaskExecutor.create({
        demand: {
          workload: {
            imageTag: "golem/alpine:latest",
          },
        },
        market: {
          maxAgreements: 1,
          rentHours: 0.5,
          pricing: {
            model: "linear",
            maxStartPrice: 0.5,
            maxCpuPerHourPrice: 1.0,
            maxEnvPerHourPrice: 0.5,
          },
          // TDDO
          // proposalFilter: ProposalFilterFactory.allowProvidersByNameRegex(/provider-2/),
        },
      });
      let proposalReceivedProviderNames: string[] = [];
      const taskCompletedIds: string[] = [];
      executor.events.on("taskCompleted", (details) => taskCompletedIds.push(details.id));
      // TODO
      // executor.events.on("golemEvents", (event) => {
      //   if (event.name === Events.ProposalResponded.name) {
      //     proposalReceivedProviderNames.push((event as Events.ProposalResponded).detail.provider.name);
      //   }
      // });
      const data = ["one", "two", "three"];
      const futureResults = data.map((x) =>
        executor.run(async (ctx) => {
          const res = await ctx.run(`echo "${x}"`);
          return res.stdout?.toString().trim();
        }),
      );
      const finalOutputs = (await Promise.all(futureResults)).filter((x) => !!x);
      expect(finalOutputs).toEqual(expect.arrayContaining(data));
      await sleep(5);
      expect(proposalReceivedProviderNames).toContain("provider-2");
      expect(taskCompletedIds).toEqual(expect.arrayContaining(["1", "2", "3"]));
      await executor.shutdown();
    });
  });
});
