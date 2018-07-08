// node libraries
const fs = require('fs');

// our libraries
const db = require('./database');

// globals
const {
  DB_DUMP_INTERVAL,
  FILE_DELETION_INTERVAL,
  FILE_DIR,
  TMP_EXT,
  FINAL_EXT
} = require('./globals');

// config
const Logger = require('./logger');
const logger = new Logger('task manager');

// delete unused files
function clearFiles(clearAll) {
  logger.log('deleting unused files');
  fs.readdir(FILE_DIR, (err, files) => {
    for (const file of files) {
      const createdAt = new Date(fs.statSync(`${FILE_DIR}/${file}`).mtime).getTime();
      if (file !== '.gitkeep' && (clearAll || Date.now() - createdAt >= FILE_DELETION_INTERVAL)) {
        fs.unlink(`${FILE_DIR}/${file}`);
      }
    }
  });
}

// one off startup tasks
[db.createDefaults, () => clearFiles(true)].forEach((callback) => callback());

// repeating tasks
const repeat = [
  {
    func: db.keepAlive,
    int: 10000
  },
  {
    func: db.dump,
    int: DB_DUMP_INTERVAL
  },
  {
    func: clearFiles,
    int: FILE_DELETION_INTERVAL
  }
];

repeat.forEach((task) => setInterval(task.func, task.int));
