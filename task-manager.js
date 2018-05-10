const fs = require('fs');
const db = require('./database');
const Logger = require('./logger');

const {
  DB_DUMP_INTERVAL,
  FILE_DELETION_INTERVAL,
  FILE_DIR,
  TMP_EXT,
  FINAL_EXT
} = require('./globals');

const logger = new Logger('task manager');

// delete downloaded files older than the specified time
function clearFiles() {
  logger.log('deleting old downloaded files');
  fs.readdir(FILE_DIR, (err, files) => {
    for (const file of files) {
      let createdAt = new Date(fs.statSync(`${FILE_DIR}/${file}`).mtime).getTime();
      if ((file.endsWith(`.${FINAL_EXT}`) || file.endsWith(`.${TMP_EXT}`) || file.endsWith(`.${TMP_EXT}audio`)) && Date.now() - createdAt >= FILE_DELETION_INTERVAL) {
        fs.unlink(`${FILE_DIR}/${file}`);
      }
    }
  });
}

let tasks = [
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

tasks.forEach((task) => setInterval(task.func, task.int));

module.exports.clearFiles = clearFiles;
