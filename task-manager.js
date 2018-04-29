const mysqlDump = require('mysqldump');
const fs = require('fs');
const db = require('./database');
const Logger = require('./logger');

const {
  DB_CREDS,
  DB_DUMP_INTERVAL,
  FILE_DELETION_INTERVAL,
  FILE_DIR,
  TMP_EXT,
  FINAL_EXT
} = require('./globals');

const logger = new Logger();

// dump the database to a backup file
function dbDump() {
  let dumpCreds = DbCreds;
  let id = Date.now();
  dumpCreds.dest = `bak/db/${id}`;
  mysqlDump(dumpCreds, (err) => {
    if (err) {
      throw err;
    }

    logger.log('dumped database to file', id);
  });
}

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
    func: dbDump,
    int: DB_DUMP_INTERVAL
  },
  {
    func: clearFiles,
    int: FILE_DELETION_INTERVAL
  },
  {
    func: db.keepAlive,
    int: 10000
  }
];

tasks.forEach((task) => {
  setInterval(task.func, task.int);
});

module.exports.dbDump = dbDump;
module.exports.clearFiles = clearFiles;
