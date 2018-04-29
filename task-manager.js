const mysqlDump = require('mysqldump');
const fs = require('fs');
const globals = require('./globals');

const { DbCreds } = globals;
const Logger = require('./logger');
const Database = require('./database');

const DB_DUMP_INTERVAL = process.env.DB_DUMP_INTERVAL || 3600000;
const FILE_DELETION_INTERVAL = process.env.FILE_DELETION_INTERVAL || 3600000;

const FILE_DIR = globals.FileDir;
const TMP_EXT = globals.TmpExt;
const FINAL_EXT = globals.FinalExt;

const logger = new Logger();
const db = new Database();

function TaskManager() {}

// dump the database to a backup file
TaskManager.prototype.dbDump = () => {
  let dumpCreds = DbCreds;
  let id = Date.now();
  dumpCreds.dest = `bak/db/${id}`;
  mysqlDump(dumpCreds, (err) => {
    if (err) {
      throw err;
    }

    logger.log('dumped database to file', id);
  });
};

// delete downloaded files older than the specified time
TaskManager.prototype.clearFiles = () => {
  logger.log('deleting old downloaded files');
  fs.readdir(FILE_DIR, (err, files) => {
    for (const file of files) {
      let createdAt = new Date(fs.statSync(`${FILE_DIR}/${file}`).mtime).getTime();
      if ((file.endsWith(`.${FINAL_EXT}`) || file.endsWith(`.${TMP_EXT}`) || file.endsWith(`.${TMP_EXT}audio`)) && Date.now() - createdAt >= FILE_DELETION_INTERVAL) {
        fs.unlink(`${FILE_DIR}/${file}`);
      }
    }
  });
};

let { dbDump, clearFiles } = TaskManager.prototype;
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

module.exports = TaskManager;
