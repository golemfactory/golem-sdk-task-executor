describe("Docs Examples Transfer JSON", () => {
  it("should transfer json to provider", () => {
    cy.visit("/upload-json-in-browser");
    cy.get("#YAGNA_API_BASEPATH").clear().type(Cypress.env("YAGNA_API_BASEPATH"));
    cy.get("#SUBNET_TAG").clear().type(Cypress.env("YAGNA_SUBNET"));
    cy.get("#PAYMENT_NETWORK").clear().type(Cypress.env("PAYMENT_NETWORK"));
    cy.get("#echo").click();
    cy.get("#results").should("include.text", `"Hello World"`, { timeout: 60000 });
    cy.get("#logs").contains("Task computed");
    cy.get("#logs").contains("Task Executor has shut down");
  });
});
