// our libraries
import Logger from '../logger';
import RunnableTask from './runnable-task';

// constants
const MAX_LOG_AGE_DAYS = 30;
const ONE_DAY = 86400000;

class LogCleanupTask extends RunnableTask {
  constructor() {
    super({
      hour: 2,
      minute: 0
    });
  }

  async _run(logger: Logger) {
    try {
      const filesInLogDir = await Logger.getLogFiles();
      let deleted = 0;

      for (const filename of filesInLogDir) {
        const date = Logger.getDateOfLogFile(filename);
        if (Date.now() - date.getTime() < MAX_LOG_AGE_DAYS * ONE_DAY) {
          continue;
        }

        try {
          logger.info('deleting log file', {
            filename
          });
          await Logger.deleteLog(filename);
          deleted++;
        } catch (err) {
          logger.error('error while deleting log file', {
            filename,
            err
          });
        }
      }

      logger.info('deleted log files', {
        amount: deleted
      });
    } catch (err) {
      logger.error('error while reading files in log directory', {
        err
      });
    }
  }
}

export default new LogCleanupTask();
