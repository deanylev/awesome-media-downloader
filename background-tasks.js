const mysqlDump = require('mysqldump');
const Logger = require('./logger');
const { DbCreds } = require('./credentials');

const logger = new Logger();

function BackgroundTasks() {}

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

setInterval(dbDump, 3600000);

BackgroundTasks.prototype.dbDump = dbDump;

module.exports = BackgroundTasks;
