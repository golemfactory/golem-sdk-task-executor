# Migration

## Migrating from version 1.x to 2.x

### 1. Creating a TaskExecutor instance

The key change in creating a TaskExecutor instance concerns the options passed to the `TaskExecutor.create` method.
In version 1.x the only required option was `imageHash` or `imageTag` which could be passed as a single string or as an object value of a `package` object. In version 2.x it is necessary to pass options of the [`TaskExecutorOptions`](https://github.com/golemfactory/golem-sdk-task-executor/blob/a5bd6d6ac97106b501bc5d867349c3031e6b65a6/src/executor.ts#L135) type

### Package

before:

```typescript
const executor = await TaskExecutor.create("golem/alpine:latest");
// or
const executor = await TaskExecutor.create({
  package: "golem/node:20-alpine",
});
```

after:

```typescript
const executor = await TaskExecutor.create({
  demand: {
    workload: {
      imageTag: "golem/alpine:latest",
    },
  },
});
```

### Task specific options

The `TaskExecutorOptions` is compatible with the interface used in `golem-js@3.x`. Additionally, it is extended with [options](https://github.com/golemfactory/golem-sdk-task-executor/blob/a5bd6d6ac97106b501bc5d867349c3031e6b65a6/src/executor.ts#L27) specific to the task model. E.g.

```typescript
const executor = await TaskExecutor.create({
  // ... main options used in golem-js@3
  task: {
    maxParallelTasks: 3,
    maxTaskRetries: 4,
    taskTimeout: 30_000,
    taskStartupTimeout: 10_000,
    taskRetryOnTimeout: true,
  },
});
```

### Market options

#### Allocation budget

In version 1.x, defining the allocation budget used to pay for tasks, was defined directly using the budget parameter. Now in version 2.x we do not specify the budget directly, but it is estimated using parameters specified in market options.

before:

```typescript
const executor = await TaskExecutor.create({
  package: "golem/node:20-alpine",
  budget: 2,
});
```

after:

```typescript
const executor = await TaskExecutor.create({
  // ... demand options
  market: {
    // We're only going to rent the provider for 5 minutes max
    rentHours: 5 / 60,
    pricing: {
      model: "linear",
      maxStartPrice: 0.5,
      maxCpuPerHourPrice: 1.0,
      maxEnvPerHourPrice: 0.5,
    },
  },
});
```

Additionally, it is also possible to pass your own allocation (previously created).

```typescript
// allocation created using golem-js library
const allocation = await glm.payment.createAllocation({
  budget: 1,
  expirationSec: 60 * 60,
});

const executor = await TaskExecutor.create({
  // ... demand options
  market: {
    rentHours: 5 / 60,
    pricing: {
      model: "burn-rate",
      avgGlmPerHour: 0.5,
    },
  },
  payment: {
    // You can either pass the allocation object ...
    allocation,
  },
});
```

#### Proposal filters

To filter offers according to a specific strategy, as in version 1.x, you can use predefined filters, but now they have been moved to the golem-js library.

before:

```typescript
import { TaskExecutor, ProposalFilterFactory } from "@golem-sdk/task-executor";
const whiteListIds = [
  "0x79bcfdc92af492c9b15ce9f690c3ccae53437179",
  "0x3c6a3f59518a0da1e75ea4351713bfe908e6642c",
  "0x1c1c0b14e321c258f7057e29533cba0081df8bb8",
];

const executor = await TaskExecutor.create({
  package: "golem/alpine:latest",
  proposalFilter: ProposalFilterFactory.allowProvidersById(whiteListIds),
});
```

after:

```typescript
import { TaskExecutor } from "@golem-sdk/task-executor";
import { OfferProposalFilterFactory } from "@golem-sdk/golem-js";

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
    offerProposalFilter: OfferProposalFilterFactory.allowProvidersById(whiteListIds),
  },
});
```

#### Agreement selector

The `agreementSelector` has been replaced with the `offerProposalSelector` parameter. In version 2.x, it is only used to define the method of selecting the best offer from those available on the market. In version 1.x, this selection was made from among the offers and existing agreements in the pool, but now this collection applies only to offers fetched from the market. Predefined selectors have been removed

before:

```typescript
import { TaskExecutor, AgreementSelectors } from "@golem-sdk/task-executor";
const scores = {
  "0x79bcfdc92af492c9b15ce9f690c3ccae53437179": 100,
  "0x3c6a3f59518a0da1e75ea4351713bfe908e6642c": 50,
  "0x1c1c0b14e321c258f7057e29533cba0081df8bb8": 25,
};
const executor = await TaskExecutor.create({
  package: "golem/alpine:latest",
  agreementSelector: AgreementSelectors.bestAgreementSelector(scores),
});
```

after:

```typescript
/** Selector selecting the provider according to the provided list of scores */
const bestOfferSelector = (scores: { [providerId: string]: number }) => (proposals: OfferProposal[]) => {
  proposals.sort((a, b) => ((scores?.[a.provider.id] || 0) >= (scores?.[b.provider.id] || 0) ? 1 : -1));
  return proposals[0];
};

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
    offerProposalSelector: bestOfferSelector(scores),
  },
});
```

### Network (VPN)

If you want your tasks to share the same VPN and in version 1.x, you should define the `networkIp` parameter and additionally specify the required `capabilities` of the provider.

before:

```typescript
const executor = await TaskExecutor.create({
  package: "golem/node:20-alpine",
  capabilities: ["vpn"],
  networkIp: "192.168.0.0/24",
});
```

Now, in version 2.x, you need to define the `vpn` parameter and also the `capabilities` in the `demand` object

after:

```typescript
const executor = await TaskExecutor.create({
  vpn: "192.168.0.0/24", // or vpn: true to use dafault ip addrss
  demand: {
    workload: {
      imageTag: "golem/examples-ssh:latest",
      capabilities: ["vpn"],
    },
  },
  // ...market options
});
```

### Payment filters

Predefined payment filters have been moved to the golem-js library.

before:

```typescript
import { TaskExecutor, PaymentFilters } from "@golem-sdk/task-executor";
const executor = await TaskExecutor.create({
  package: "golem/alpine:latest",
  payment: { network: "polygon", driver: "erc20" },
  invoiceFilter: PaymentFilters.acceptMaxAmountInvoiceFilter(0.07),
});
```

after:

```typescript
import { TaskExecutor } from "@golem-sdk/task-executor";
import { PaymentFilters } from "@golem-sdk/golem-js";

const executor = await TaskExecutor.create({
  // ..demand and market options
  payment: {
    network: "polygon",
    driver: "erc20",
    invoiceFilter: PaymentFilters.acceptMaxAmountInvoiceFilter(0.07),
  },
});
```

### Logger

The `pinoPrettyLogger()` logger has been moved to a separate library, so in version 2.x it must be imported from a separate package.

before:

```typescript
import { TaskExecutor, pinoPrettyLogger } from "@golem-sdk/task-executor";

const executor = await TaskExecutor.create({
  // ...
  logger: pinoPrettyLogger({ level: "info" }),
  // ...
```

after:

```typescript
import { TaskExecutor } from "@golem-sdk/task-executor";
import { pinoPrettyLogger } from "@golem-sdk/pino-logger";

const executor = await TaskExecutor.create({
  // ...
  logger: pinoPrettyLogger({ level: "info" }),
  // ...
```

### Full example

Example of mapping options from version 1.x to 2.x

before:

```typescript
const executor = await TaskExecutor.create({
  package: "golem/node:20-alpine",
  logger: pinoPrettyLogger(),
  yagnaOptions: { apiKey: "try_golem", basePath: "http://127.0.0.1:7465" },
  payment: { driver: "erc20", network: "holesky" },
  budget: 2,
  minMemGib: 7,
  minStorageGib: 3,
  minCpuCores: 4,
  taskTimeout: 80_000,
  subnetTag: "public",
  enableLogging: true,
  maxTaskRetries: 4,
  activityPreparingTimeout: 20_000,
  skipProcessSignals: false,
  startupTimeout: 30_000,
  taskStartupTimeout: 40_000,
  exitOnNoProposals: true,
  taskRetryOnTimeout: true,
  maxParallelTasks: 3,
  activityPreparingTimeout: 60_000,
  taskTimeout: 120_000,
  networkIp: "192.168.0.0/24",
  capabilities: ["vpn"],
  proposalFilter: OfferProposalFilterFactory.allowProvidersById(whiteListIds),
  agreementSelector: AgreementSelectors.bestAgreementSelector(scores),
  invoiceFilter: PaymentFilters.acceptMaxAmountInvoiceFilter(0.07),
  activityExeBatchResultPollIntervalSeconds: 12,
  activityPreparingTimeout: 333_000,
});
```

after:

```typescript
const executor = await TaskExecutor.create({
  logger: pinoPrettyLogger(),
  api: { key: "try_golem", url: "http://127.0.0.1:7465" },
  enableLogging: true,
  skipProcessSignals: false,
  startupTimeout: 30_000,
  exitOnNoProposals: true,
  vpn: "192.168.0.0/24",
  demand: {
    workload: {
      imageTag: "golem/alpine:latest",
      minMemGib: 7,
      minStorageGib: 3,
      minCpuCores: 4,
      capabilities: ["vpn"],
    },
    subnetTag: "public",
  },
  market: {
    rentHours: 0.5,
    pricing: {
      model: "linear",
      maxStartPrice: 0.5,
      maxCpuPerHourPrice: 1.0,
      maxEnvPerHourPrice: 0.5,
    },
    offerProposalFilter: OfferProposalFilterFactory.allowProvidersById(whiteListIds),
    offerProposalSelector: bestOfferProposalSelector(scores),
  },
  payment: {
    network: "holesky",
    driver: "erc20",
    invoiceFilter: PaymentFilters.acceptMaxAmountInvoiceFilter(0.07),
  },
  acticity: {
    activityDeployingTimeout: 60_000,
    activityExeBatchResultPollIntervalSeconds: 12,
  },
  task: {
    taskStartupTimeout: 40_000,
    maxTaskRetries: 4,
    taskRetryOnTimeout: true,
    maxParallelTasks: 3,
  },
});
```

### 2. Running tasks

#### The `WorkContext` object

The `WorkContext` object available in the worker function in the `run()` methods has now been renamed to `ExeUnit` and thus `ctx` has been renamed to `exe`.

before:

```typescript
await executor.run(async (ctx) => console.log((await ctx.run("echo 'Hello World'")).stdout));
```

after:

```typescript
await executor.run(async (exe) => console.log((await exe.run("echo 'Hello World'")).stdout));
```

The new `ExeUnit` object is imported from the golem-js engine. The full interface specification can be found [here](https://github.com/golemfactory/golem-js/blob/master/src/activity/exe-unit/exe-unit.ts)

#### The `onActivityReady` function

The previous function `executor.onActivityReady` which was used for initial task has been moved to `TaskExecutorOptions` as a `setup` parameter.

before:

```typescript
executor.onActivityReady(async (ctx) => await ctx.uploadFile(`./file.txt`, "/golem/resource/file.txt"));
```

after:

```typescript
const executor = await TaskExecutor.create({
  // ...other options
  task: {
    setup: async (exe) => await exe.uploadFile(`./file.txt`, "/golem/resource/file.txt"),
  },
});
```

Additionally, in the configuration you can now define a `teardown` function that will be run before the exe unit is destroyed.

```typescript
const executor = await TaskExecutor.create({
  // ...other options
  task: {
    terdown: async (exe) => exe.run("rm /golem/resource/file.txt"),
  },
});
```

### 3. Events handling

In version 1.x, all events were available from the `ecxecutor.events.on` level and all events related to golem-js core were emit on one `golemEvents` stream. Now in version 2.x, particular events are available under appropriate emitters eg. `TaskExecutor.glm.market.events.on`.

before:

```typescript
const executor = await TaskExecutor.create({
  package: "golem/alpine:latest",
});
// Golem-js core events
executor.events.on("golemEvents", (event) => {
  if (event.name === "agreementApproved") {
    console.log("Agreement approved:", event);
  }
  if (event.name === "invoiceReceived") {
    console.log("Invoice received:", event);
  }
  if (event.name === "activityCreated") {
    console.log("Activity created:", event);
  }
});

// TaskExecutor specific events
executor.events.on("taskStarted", (event) => {
  console.log("Task started:", event);
});
executor.events.on("taskCompleted", (event) => {
  console.log("Task completed:", event);
});
```

after:

```typescript
const executor = await TaskExecutor.create({
  demand: {
    workload: {
      imageTag: "golem/alpine:latest",
    },
  },
});
// Golem-js core events
executor.glm.market.events.on("agreementApproved", (event) => {
  console.log("Agreement approved:", event);
});
executor.glm.payment.events.on("invoiceReceived", (event) => {
  console.log("Invoice received:", event);
});
executor.glm.activity.events.on("activityCreated", (event) => {
  console.log("Activity created:", event);
});

// TaskExecutor specific events
executor.events.on("taskStarted", (event) => {
  console.log("Task started:", event);
});
executor.events.on("taskCompleted", (event) => {
  console.log("Task completed:", event);
});
```
