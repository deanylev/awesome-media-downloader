// node libraries
import fs from 'fs';
import { inspect } from 'util';

// third party libraries
import chalk from 'chalk';

// our libraries
import { logger as loggerConfig } from './config';
import { LOG_FILE_DIR } from './constants';
import { LogLevel } from './enums';

type Data = unknown[];
type MetadataData = Record<string, unknown>;
type Metadata = null | MetadataData | (() => MetadataData);

export default class Logger {
  private static logLevelOrder = [
    LogLevel.INFO,
    LogLevel.WARN,
    LogLevel.ERROR,
    LogLevel.FATAL
  ];
  private metadata: Metadata;
  private prefix: string;
  private static writeQueue = Promise.resolve();

  error = this.logAlias(LogLevel.ERROR);
  fatal = this.logAlias(LogLevel.FATAL);
  info = this.logAlias(LogLevel.INFO);
  warn = this.logAlias(LogLevel.WARN);

  constructor(prefix: string, metadata: Metadata = null) {
    this.prefix = prefix;
    this.metadata = metadata;
  }

  static async deleteLog(filename: string) {
    try {
      const filePath = `${LOG_FILE_DIR}/${filename}`;
      await fs.promises.unlink(filePath);
      return true;
    } catch (err) {
      return false;
    }
  }

  private getConsoleLevel(level: LogLevel) {
    switch (level) {
      case LogLevel.INFO:
        return 'log';
      case LogLevel.WARN:
        return 'warn';
      case LogLevel.ERROR:
      case LogLevel.FATAL:
        return 'error';
    }
  }

  private static getChalkColour(level: LogLevel) {
    switch (level) {
      case LogLevel.INFO:
        return 'green';
      case LogLevel.WARN:
        return 'yellow';
      case LogLevel.ERROR:
        return 'red';
      case LogLevel.FATAL:
        return 'magenta';
    }
  }

  static getDateOfLogFile(filename: string) {
    const year = parseInt(filename.substr(0, 4), 10);
    const month = parseInt(filename.substr(4, 2), 10) - 1;
    const day = parseInt(filename.substr(6, 2), 10);
    return new Date(year, month, day);
  }

  static async getLogFiles() {
    const files = await fs.promises.readdir(LOG_FILE_DIR);
    return files.filter((filename) => /^20\d{6}\.log$/.test(filename));
  }

  private static getLogString(level: LogLevel, file: boolean, prefix: string) {
    const date = new Date();
    const time = date.toLocaleTimeString('en-US', {
      hour12: false
    });
    const milliseconds = date.getMilliseconds().toString().padEnd(3, '0');
    const levelString = level.toUpperCase();
    const chalkColour = Logger.getChalkColour(level);
    return `${time}:${milliseconds} ${file ? levelString : chalk[chalkColour](levelString)}: [${prefix}]`;
  }

  private getLogString(level: LogLevel, file: boolean) {
    return Logger.getLogString(level, file, this.prefix);
  }

  static internalError(error: Error) {
    // XXX not actually fatal, but a fundamental failure
    // eslint-disable-next-line no-console
    console.error(Logger.getLogString(LogLevel.FATAL, false, 'INTERNAL'), 'INTERNAL ERROR', {
      error
    });
  }

  private logAlias(level: LogLevel) {
    return async (...data: Data) => {
      if (loggerConfig.modules && !loggerConfig.modules.includes(this.prefix)) {
        return;
      }

      const { logLevelOrder } = Logger;
      const logToConsole = logLevelOrder.indexOf(level) >= logLevelOrder.indexOf(loggerConfig.consoleLevel);
      const logToFile = logLevelOrder.indexOf(level) >= logLevelOrder.indexOf(loggerConfig.fileLevel);

      const metadata = typeof this.metadata === 'function' ? this.metadata() : this.metadata;
      if (metadata) {
        data.push(metadata);
      }

      if (logToConsole) {
        this.logToConsole(level, ...data);
      }

      if (logToFile) {
        await this.logToFile(level, ...data);
      }
    };
  }

  private logToConsole(level: LogLevel, ...data: Data) {
    const consoleLevel = this.getConsoleLevel(level);
    // eslint-disable-next-line no-console
    console[consoleLevel](this.getLogString(level, false), ...data);
  }

  private logToFile(level: LogLevel, ...data: Data) {
    const now = new Date();
    const pad = (number: number) => number.toString().padStart(2, '0');
    const filename = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.log`;
    const stringifiedData = data.map((value) => typeof value === 'string' ? value : inspect(value, {
      compact: true,
      depth: 3, // match console.log
      showHidden: true
    }).replace(/\s\s+/g, ' '));
    const stringToWrite = `${this.getLogString(level, true)} ${stringifiedData.join(' ')}\n`;
    Logger.writeQueue = Logger.writeQueue.finally(() => {
      return fs.promises.writeFile(`${LOG_FILE_DIR}/${filename}`, stringToWrite, {
        flag: 'a'
      });
    }).catch(Logger.internalError);

    return Logger.writeQueue;
  }

  static wrapWithMetadata(logger: Logger, metadata: Metadata) {
    return new Logger(logger.prefix, metadata);
  }
}
