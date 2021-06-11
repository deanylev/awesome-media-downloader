// our libraries
import { Environment, LogLevel } from './enums';

const env = (Object.values(Environment) as string[]).includes(process.env.NODE_ENV ?? '') ? process.env.NODE_ENV as Environment : Environment.DEVELOPMENT;
const httpPort = parseInt(process.env.PORT ?? '8080', 10);

export const appUrl = process.env.APP_URL ?? (env === Environment.PRODUCTION ? 'https://awesomemediadownloader.xyz' : `http://localhost:${httpPort}`);
export { env };
export { httpPort };
export const logger = {
  consoleLevel: (Object.values(LogLevel) as string[]).includes(process.env.LOG_LEVEL_CONSOLE ?? '') ? process.env.LOG_LEVEL_CONSOLE as LogLevel : LogLevel.INFO,
  fileLevel: (Object.values(LogLevel) as string[]).includes(process.env.LOG_LEVEL_FILE ?? '') ? process.env.LOG_LEVEL_FILE as LogLevel : LogLevel.INFO,
  modules: typeof process.env.LOG_MODULES === 'undefined' ? null : process.env.LOG_MODULES.split(',')
};
