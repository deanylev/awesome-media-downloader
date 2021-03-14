// our libraries
import Logger from '../logger';

// third party libraries
import { RecurrenceSpecObjLit } from 'node-schedule';

export default abstract class RunnableTask {
  interval: RecurrenceSpecObjLit;
  private runPromise: null | Promise<void> = null;
  runAtStartup: boolean;

  constructor(interval: RecurrenceSpecObjLit, runAtStartup = true) {
    this.interval = interval;
    this.runAtStartup = runAtStartup;
  }

  abstract _run(logger: Logger): Promise<void>;

  run(logger: Logger) {
    if (!this.runPromise) {
      this.runPromise = this._run(logger)
        .finally(() => this.runPromise = null);
    }

    return this.runPromise;
  }
}
