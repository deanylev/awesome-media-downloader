const mysqlDump = require('mysqldump');
const Logger = require('./logger');
const globals = require('./globals');
const { DbCreds } = globals;

const DB_DUMP_INTERVAL = process.env.DB_DUMP_INTERVAL || 3600000;
const FILE_DELETION_INTERVAL = process.env.FILE_DELETION_INTERVAL || 3600000;

const FILE_DIR = globals.FileDir;
const TMP_EXT = globals.TmpExt;
const FINAL_EXT = globals.FinalExt;

const logger = new Logger();

function BackgroundTasks() {}

// dump the database to a backup file
let dbDump = () => {
  let dumpCreds = DbCreds;
  let id = Date.now();
  dumpCreds['dest'] = `bak/db/${id}`;
  mysqlDump(dumpCreds, (err) => {
    if (err) {
      throw err;
    }

    logger.log('dumped database to file', id);
  });
};

setInterval(dbDump, DB_DUMP_INTERVAL);

BackgroundTasks.prototype.dbDump = dbDump;

// delete downloaded files older than the specified time
let clearFiles = () => {
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

setInterval(clearFiles, FILE_DELETION_INTERVAL);

BackgroundTasks.prototype.clearFiles = clearFiles;

module.exports = BackgroundTasks;
