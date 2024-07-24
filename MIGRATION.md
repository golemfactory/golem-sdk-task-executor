# Migration

## Migrating from version 1.x to 2.x

### 1. Creating a TaskExecutor instance

The key change in creating a TaskExecutor instance concerns the options passed to the `TaskExecutor.create` method.
In version 1.x the only required option was `imageHash` or `imageTag` which could be passed as a single string or as an object value of a `package` object. In version 2.x it is necessary to pass options of the [`TaskExecutorOptions` type](https://github.com/golemfactory/golem-sdk-task-executor/blob/a5bd6d6ac97106b501bc5d867349c3031e6b65a6/src/executor.ts#L135)

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

### Market options and defining the budget of allocation

in version 1.x, defining the allocation budget used to pay for tasks was defined directly using the budget parameter.

before:

```typescript
const executor = await TaskExecutor.create({
  package: "golem/node:20-alpine",
  budget: 2,
});
```

Now in version 2.x we do not specify the budget directly, but it is estimated using parameters specified in market options.

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

TODO

### Network (VPN)

TODO

### Full example

Example of mapping options from version 1.x to 2.x

before:

```typescript
const executor = await TaskExecutor.create({
  package: "golem/node:20-alpine",
  logger: pinoPrettyLogger(),
  yagnaOptions: { apiKey: "try_golem", basePath: "http://127.0.0.1:7465" },
  budget: 2,
  payment: { driver: "erc-20", network: "holesky" },
  taskTimeout: 30_000,
  subnetTag: "public",
  enableLogging: true,
  maxTaskRetries: 4,
  activityPreparingTimeout: 20_000,
  skipProcessSignals: false,
  startupTimeout: 30_000,
  taskStartupTimeout: 30_000,
  exitOnNoProposals: true,
  taskRetryOnTimeout: true,
  maxParallelTasks: 3,
  activityPreparingTimeout: 60_000,
  taskTimeout: 120_000,
  proposalFilter: xx,
  invoiceFilter: yy,
  debitNotesFilter: zz,
});
```

after:

```typescript
// todo
```

### 2. Running tasks

### 3. Events handling
