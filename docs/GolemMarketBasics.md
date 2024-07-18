# Golem Network Market Basics

<!-- TOC -->

- [Golem Network Market Basics](#golem-network-market-basics)
  - [Mid-agreement payments to the Providers for used resources](#mid-agreement-payments-to-the-providers-for-used-resources)
  - [Limit price limits to filter out offers that are too expensive](#limit-price-limits-to-filter-out-offers-that-are-too-expensive)
  - [Work with reliable providers](#work-with-reliable-providers)
  <!-- TOC -->

The Golem Network provides an open marketplace where anyone can join as a Provider and supply the network with their
computing power. In return for their service, they are billing Requestors (users of this library) according to the pricing
that they define.

As a Requestor, you might want to:

- control the limit price so that you're not going to over-spend your funds
- control the interactions with the providers if you have a list of the ones which you like or the ones which you would
  like to avoid

To make this easy, we provided you with a set of predefined market proposal filters, which you can combine to implement
your own market strategy (described below).

## Mid-agreement payments to the Providers for used resources

When you obtain resources from the Provider and start using them, the billing cycle will start immediately.
Since reliable service and payments are important for all actors in the Golem Network,
the library makes use of the mid-agreement payments model and implements best practices for the market, which include:

- responding and accepting debit notes for activities that last longer than 30 minutes
- issuing mid-agreement payments (pay-as-you-go)

By default, the library will:

- accept debit notes sent by the Providers within two minutes of receipt (so that the Provider knows that we're alive,
  and it will continue serving the resources)
- issue a mid-agreement payment every 12 hours (so that the provider will be paid on a regular interval for serving the
  resources for more than 10 hours)

You can learn more about
the [mid-agreement and other payment models from the official docs](https://docs.golem.network/docs/golem/payments).

These values are defaults and can be influenced by the following settings:

- `DemandOptions.expirationSec`
- `DemandOptions.debitNotesAcceptanceTimeoutSec`
- `DemandOptions.midAgreementPaymentTimeoutSec`

If you're using `TaskExecutor` to run tasks on Golem, you can pass them as part of the configuration object accepted
by `TaskExecutor.create`.

## Limit price limits to filter out offers that are too expensive

```typescript
import { TaskExecutor, ProposalFilterFactory } from "@golem-sdk/task-executor";

const executor = await TaskExecutor.create({
  // What do you want to run
  package: "golem/alpine:3.18.2",

  // How much you wish to spend
  budget: 2.0,
  proposalFilter: ProposalFilterFactory.limitPriceFilter({
    start: 1.0,
    cpuPerSec: 1.0 / 3600,
    envPerSec: 1.0 / 3600,
  }),

  // Where you want to spend
  payment: {
    network: "polygon",
  },
});
```

To learn more about other filters, please check
the [API reference of the market/strategy module](https://docs.golem.network/docs/golem-js/reference/modules/market_strategy)

## Work with reliable providers

The `getHealthyProvidersWhiteList` helper will provide you with a list of Provider ID's that were checked with basic
health-checks. Using this whitelist will increase the chance of working with a reliable provider. Please note, that you
can also build up your own list of favourite providers and use it in a similar fashion.

```typescript
import { MarketHelpers, ProposalFilterFactory, TaskExecutor } from "@golem-sdk/task-executor";

// Collect the whitelist
const verifiedProviders = await MarketHelpers.getHealthyProvidersWhiteList();

// Prepare the whitelist filter
const whiteList = ProposalFilterFactory.allowProvidersById(verifiedProviders);

// Prepare the price filter
const acceptablePrice = ProposalFilterFactory.limitPriceFilter({
  start: 1.0,
  cpuPerSec: 1.0 / 3600,
  envPerSec: 1.0 / 3600,
});

const executor = await TaskExecutor.create({
  // What do you want to run
  package: "golem/alpine:3.18.2",

  // How much you wish to spend
  budget: 2.0,
  proposalFilter: (proposal) => acceptablePrice(proposal) && whiteList(proposal),

  // Where you want to spend
  payment: {
    network: "polygon",
  },
});
```
