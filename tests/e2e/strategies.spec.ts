import { TaskExecutor, ProposalFilterFactory } from "../../src";
import { sleep } from "../../src/utils";
import { Events } from "@golem-sdk/golem-js";

describe("Strategies", function () {
  describe("Proposals", () => {
    it("should filtered providers by black list names", async () => {
      const executor = await TaskExecutor.create({
        package: "golem/alpine:latest",
        proposalFilter: ProposalFilterFactory.disallowProvidersByNameRegex(/provider-2/),
      });
      let proposalReceivedProviderNames: string[] = [];
      const taskCompletedIds: string[] = [];
      executor.events.on("taskCompleted", (details) => taskCompletedIds.push(details.id));
      executor.events.on("golemEvents", (event) => {
        if (event.name === Events.ProposalReceived.name) {
          proposalReceivedProviderNames.push((event as Events.ProposalReceived).detail.provider.name);
        }
      });
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
        package: "golem/alpine:latest",
        proposalFilter: ProposalFilterFactory.allowProvidersByNameRegex(/provider-2/),
      });
      let proposalReceivedProviderNames: string[] = [];
      const taskCompletedIds: string[] = [];
      executor.events.on("taskCompleted", (details) => taskCompletedIds.push(details.id));
      executor.events.on("golemEvents", (event) => {
        if (event.name === Events.ProposalReceived.name) {
          proposalReceivedProviderNames.push((event as Events.ProposalReceived).detail.provider.name);
        }
      });
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
