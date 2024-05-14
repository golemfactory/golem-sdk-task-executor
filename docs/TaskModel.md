# Task Model

<!-- TOC -->

- [Task Model](#task-model)
  - [The worker function](#the-worker-function)
  - [Task related timeouts](#task-related-timeouts)
  - [Retrying tasks](#retrying-tasks)
  <!-- TOC -->

This document explains the requirements that have been set for the task model implemented in the Task Executor.

> **NOTE**
>
> This document is not complete and information might be added over time.

## The worker function

The _worker function_ is the most basic building block for Task Executor. You should define the details and steps of the work that you want to do execute on the Provider within that function.

```ts
const te = await TaskExecutor.create({
  package: "golem/alpine:latest",
});

const taskFunction = (ctx: WorkContext) => {
  return ctx.run("echo 'Hello world'");
};

await te.run(taskFunction);
```

When you call `TaskExecutor.run`, the execution of the _task function_ is placed in an internal queue from which it will be picked up when computation resources will become available.

## Task related timeouts

As the user of Task Executor you can specify two types of timeouts related to the tasks:

- `taskStartupTimeout` (in milliseconds, default: `undefined` - no timeout measurement) - Determines the max allowed time for the _task function_ execution to start after it's taken off the queue. This time period covers lookup for the resources on the market, negotiations, signing agreements with Providers and deploying the image on the activity started on the provider. As that's not something you can influence too much, make sure that this timeout is reasonable. Once reached, `GolemTimeoutEror` will be raised.

- `taskTimeout` (in milliseconds, default: `undefined` - not timeout measurement) - Determines the max allowed time for the _task function_ execution, after which a `GolemTimeoutError` will be raised.

## Retrying tasks

Task Executor is capable of retrying _task function_ executions in certain conditions. For the Requestors sake, the rules are established with cost minimisation as priority.

The rules are:

- No user errors thrown by the _task function_ itself will be retried
- If a `GolemTimeoutError` will be raised because one of the task related timeouts, the task will not be retried by default.
  - You can opt in for retrying tasks that timed out by setting `taskRetryOnTimeout` to `true`.
- If a `GolemWorkError` will be raised (in case when for example the deployment of the activity failed on one of the Providers), the task will be retried.
- At any case, the task should not be retried more than `maxTaskRetries` times (default: `3`).
