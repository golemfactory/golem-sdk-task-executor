import { Logger } from "@golem-sdk/golem-js";
import * as pino from "pino";
import * as pinoPretty from "pino-pretty";

class Pino implements Logger {
  private logger: pino.Logger;

  constructor(
    private optionsOrStream?: pino.LoggerOptions | pino.DestinationStream,
    child?: pino.Logger,
    private namespace?: string,
  ) {
    this.logger = child || pino.pino(optionsOrStream);
  }

  debug(msg: string): void;
  debug(msg: string, ctx?: Record<string, unknown> | Error) {
    this.logger.debug(ctx, msg);
  }

  info(msg: string): void;
  info(msg: string, ctx?: Record<string, unknown> | Error) {
    this.logger.info(ctx, msg);
  }

  warn(msg: string): void;
  warn(msg: string, ctx?: Record<string, unknown> | Error) {
    this.logger.warn(ctx, msg);
  }

  error(msg: string): void;
  error(msg: string, ctx?: Record<string, unknown> | Error) {
    this.logger.error(ctx, msg);
  }

  child(namespace: string): Pino {
    const fullNamespace = this.namespace ? `${this.namespace}:${namespace}` : namespace;
    return new Pino(this.optionsOrStream, this.logger.child({ namespace: fullNamespace }), fullNamespace);
  }
}

/**
 * Golem Logger interface implementation using the Pino library
 * https://github.com/pinojs/pino
 * @param optionsOrStream
 * https://github.com/pinojs/pino/blob/master/docs/api.md#options
 * https://github.com/pinojs/pino/blob/master/docs/api.md#destination
 */
export function pinoLogger(optionsOrStream?: pino.LoggerOptions | pino.DestinationStream): Logger {
  return new Pino(optionsOrStream);
}

/**
 * Golem Logger interface implementation using the Pino-Pretty library
 * Default set: `ignore: "pid,hostname,namespace", singleLine: true`
 * https://github.com/pinojs/pino-pretty
 * @param options -https://github.com/pinojs/pino-pretty?tab=readme-ov-file#options
 */
export function pinoPrettyLogger(options?: pinoPretty.PrettyOptions): Logger {
  return new Pino({
    transport: {
      target: "pino-pretty",
      options: {
        ignore: "pid,hostname,namespace",
        singleLine: true,
        ...options,
      },
    },
  });
}
