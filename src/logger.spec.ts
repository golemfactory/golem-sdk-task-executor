import { pinoLogger, pinoPrettyLogger } from "./logger";
import { imock, instance, anything, when } from "@johanblumenberg/ts-mockito";
import { readFile, unlink } from "fs/promises";
import pino from "pino";
import { sleep } from "./utils";
import { writeFile } from "node:fs/promises";

const parseLogs = (logs: string) => {
  try {
    return JSON.parse(logs);
  } catch (error) {
    return logs;
  }
};

describe("PinoLogger", () => {
  describe("Pino default (json) logger", () => {
    let mockOutput = "";
    const mockDestination = imock<pino.DestinationStream>();
    when(mockDestination.write(anything())).thenCall((msg) => (mockOutput = msg));

    it("should write logs as standard default pino json output", () => {
      const logger = pinoLogger(instance(mockDestination));
      logger.info("test log", { param: "test-param" });
      expect(parseLogs(mockOutput)?.msg).toEqual("test log");
      expect(parseLogs(mockOutput)?.param).toEqual("test-param");
    });

    it("should write logs with child namespaces", () => {
      const logger = pinoLogger(instance(mockDestination));
      logger.info("test log parent");
      expect(parseLogs(mockOutput)?.msg).toEqual("test log parent");
      const child1 = logger.child("child-1");
      child1.info("test log child 1");
      expect(parseLogs(mockOutput)?.msg).toEqual("test log child 1");
      expect(parseLogs(mockOutput)?.namespace).toEqual("child-1");
      const child2 = child1.child("child-2");
      child2.info("test log child 2");
      expect(parseLogs(mockOutput)?.msg).toEqual("test log child 2");
      expect(parseLogs(mockOutput)?.namespace).toEqual("child-1:child-2");
    });
  });

  describe("Pino pretty logger", () => {
    it("should write logs as pino pretty output", async () => {
      await writeFile("./test.log", "");
      const logger = pinoPrettyLogger({ destination: "./test.log", sync: true });
      logger.info("test log", { param: "test" });
      await sleep(200, true);
      expect(await readFile("./test.log", "utf8")).toMatch(
        /^\[\d{2}:\d{2}:\d{2}\.\d{3}\].*INFO.*:.*test log.*{"param":"test"}.*/,
      );
      await unlink("./test.log");
    });
  });
});
