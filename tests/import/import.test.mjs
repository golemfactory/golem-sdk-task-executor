describe("ESM Import", () => {
  test("Import @golem-sdk/task-executor in ESM environment", async () => {
    const { TaskExecutor } = await import("@golem-sdk/task-executor");
    expect(typeof TaskExecutor).toBe("function");
  });
});
