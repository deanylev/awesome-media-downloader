// third party libraries
const mysql = require('mysql');
const mysqlDump = require('mysqldump');
const moment = require('moment');

// globals
const { DB_CREDS } = require('./globals');

// config
const pool = mysql.createPool(DB_CREDS);

const Logger = require('./logger');
const logger = new Logger('database');

function createDefaults() {
  [
    'CREATE TABLE IF NOT EXISTS logs ( \
    id int(11) NOT NULL AUTO_INCREMENT, \
    datetime datetime NOT NULL, \
    level int(5) NOT NULL, \
    originator int(5) NOT NULL, \
    message int(5) NOT NULL, \
    data mediumtext, \
    PRIMARY KEY (id), \
    UNIQUE KEY id_UNIQUE (id) \
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8',

    'CREATE TABLE IF NOT EXISTS downloads ( \
    id varchar(36) NOT NULL, \
    datetime datetime NOT NULL, \
    clientId varchar(40) NOT NULL, \
    url mediumtext NOT NULL, \
    name varchar(255) NOT NULL, \
    PRIMARY KEY (id), \
    UNIQUE KEY id_UNIQUE (id) \
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8'
  ].forEach((sql) => {
    query(sql).catch((err) => {
      if (err) {
        throw err;
      }
    });
  });
}

function query(query, values) {
  return new Promise((resolve, reject) => {
    pool.getConnection((err, connection) => {
      connection.query(query, values, (err, results) => {
        connection.release();
        if (err) {
          reject(err);
        } else {
          resolve(results);
        }
      });
    });
  });
}

function now() {
  return moment().format('YYYY-MM-DD HH:mm:ss');
}

function keepAlive() {
  query('SELECT 1');
}

function dump() {
  const id = Date.now();
  const creds = Object.assign({
    dest: `bak/db/${id}`
  }, DB_CREDS);
  mysqlDump(creds, (err) => {
    if (err) {
      throw err;
    }

    logger.log('dumped database to file', id);
  });
}

Object.assign(module.exports, {
  createDefaults,
  query,
  now,
  keepAlive,
  dump
});
