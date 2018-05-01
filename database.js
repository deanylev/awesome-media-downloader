const mysql = require('mysql');
const mysqlDump = require('mysqldump');
const moment = require('moment');
const Logger = require('./logger');

const { DB_CREDS } = require('./globals');

const db = mysql.createConnection(DB_CREDS);
const logger = new Logger();

function createDefaults() {
  db.query(
    'CREATE TABLE IF NOT EXISTS `logs` ( \
    `id` int(11) NOT NULL AUTO_INCREMENT, \
    `datetime` datetime NOT NULL, \
    `level` varchar(10) NOT NULL, \
    `message` int(5) NOT NULL, \
    `data` mediumtext, \
    PRIMARY KEY (`id`), \
    UNIQUE KEY `id_UNIQUE` (`id`) \
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8',
    (err) => {
      if (err) {
        throw err;
      }
    });

  db.query(
    'CREATE TABLE IF NOT EXISTS `downloads` ( \
    `id` varchar(36) NOT NULL, \
    `datetime` datetime NOT NULL, \
    `clientId` varchar(40) NOT NULL, \
    `url` mediumtext NOT NULL, \
    `name` varchar(255) NOT NULL, \
    PRIMARY KEY (`id`), \
    UNIQUE KEY `id_UNIQUE` (`id`) \
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8',
    (err) => {
      if (err) {
        throw err;
      }
    });
}

function query(query, values) {
  return new Promise((resolve, reject) => {
    db.query(query, values, (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results);
      }
    });
  });
}

function now() {
  return moment().format('YYYY-MM-DD HH:mm:ss');
}

function keepAlive() {
  db.query('SELECT 1');
}

function dump() {
  let id = Date.now();
  DB_CREDS.dest = `bak/db/${id}`;
  mysqlDump(DB_CREDS, (err) => {
    if (err) {
      throw err;
    }

    logger.log('dumped database to file', id);
  });
}

module.exports.createDefaults = createDefaults;
module.exports.query = query;
module.exports.now = now;
module.exports.keepAlive = keepAlive;
module.exports.dump = dump;
