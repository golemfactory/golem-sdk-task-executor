describe("Test TaskExecutor API", () => {
  it("should run transfer file example", () => {
    cy.visit("/image");
    cy.get("#YAGNA_APPKEY").clear().type(Cypress.env("YAGNA_APPKEY"));
    cy.get("#YAGNA_API_BASEPATH").clear().type(Cypress.env("YAGNA_API_BASEPATH"));
    cy.get("#SUBNET_TAG").clear().type(Cypress.env("YAGNA_SUBNET"));
    cy.get("#PAYMENT_NETWORK").clear().type(Cypress.env("PAYMENT_NETWORK"));
    cy.fixture("golem.png", { encoding: null }).as("imageFile");
    cy.get("#MEME_IMG").selectFile("@imageFile");
    cy.get("#RUN").click();
    cy.get("#RESULT_MEME").should("have.attr", "src").and("contain", "blob:http://localhost:3000", { timeout: 60000 });
  });
});
