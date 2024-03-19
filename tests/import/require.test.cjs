describe("CommonJS import", () => {
  test("Require @golem-sdk/task-executor in CJS environment", async () => {
    const { TaskExecutor } = require("@golem-sdk/task-executor");
    expect(typeof TaskExecutor).toBe("function");
  });
});
