// our libraries
import { Task } from './enums';
import Logger from './logger';
import RunnableTask from './tasks/runnable-task';

// third party libraries
import schedule, { RecurrenceSpecObjLit } from 'node-schedule';

// constants
const TASKS_DIR = 'tasks';

class Scheduler {
  private logger = new Logger('scheduler');
  private intervalId = 0;
  private lastRuns = new Map<Task, number>();
  private loggers = new Map<Task, Logger>();
  private modules = new Map<Task, RunnableTask>();
  private nextRuns = new Map<Task, number>();
  private static tasks = [
    Task.LOG_CLEANUP
  ];

  constructor() {
    this.setUp();
  }

  getLastRun(name: Task) {
    return this.lastRuns.get(name);
  }

  getNextRun(name: Task) {
    return this.nextRuns.get(name);
  }

  run(name: Task) {
    this.lastRuns.set(name, Date.now());
    this.logger.info('running task', {
      name
    });
    const logger = this.loggers.get(name);
    if (!logger) {
      return;
    }
    return this.modules.get(name)?.run(logger);
  }

  scheduleOnInterval(name: Task, interval: RecurrenceSpecObjLit, runNow: boolean) {
    const id = ++this.intervalId;
    const logger = new Logger(`task-${name}`);
    this.loggers.set(name, logger);

    this.logger.info('scheduled task on interval', {
      id,
      interval,
      name
    });

    const run = () => {
      this.logger.info('executing intervaled task', {
        id,
        nextRunInMs: setNextRun() - Date.now()
      });

      this.run(name);
    };
    const setNextRun = () => {
      const nextRun = job.nextInvocation().getTime();
      this.nextRuns.set(name, nextRun);
      return nextRun;
    };

    const job = schedule.scheduleJob({
      ...interval,
      tz: 'Australia/Melbourne'
    }, run);
    setNextRun();

    if (runNow) {
      run();
    }
  }

  async setUp() {
    for (const taskName of Scheduler.tasks) {
      const { default: task } = await import(`./${TASKS_DIR}/${taskName}`) as { default: RunnableTask };
      const { interval, runAtStartup } = task;
      this.modules.set(taskName, task);
      this.scheduleOnInterval(taskName, interval, runAtStartup !== false);
    }
  }
}

export default new Scheduler();
