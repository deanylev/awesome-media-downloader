const mysql = require('mysql');
const moment = require('moment');
const { DbCreds } = require('./globals');

const db = mysql.createConnection(DbCreds);

// hack to keep the db connection alive
setInterval(() => {
  db.query('SELECT 1');
}, 10000);

let createDefaults = () => {
  db.query(
    ' \
    CREATE TABLE IF NOT EXISTS `logs` ( \
    `id` int(11) NOT NULL AUTO_INCREMENT, \
    `datetime` datetime NOT NULL, \
    `level` varchar(10) NOT NULL, \
    `message` mediumtext NOT NULL, \
    `data` mediumtext, \
    PRIMARY KEY (`id`), \
    UNIQUE KEY `id_UNIQUE` (`id`) \
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8; \
    \
    CREATE TABLE IF NOT EXISTS `downloads` ( \
    `id` varchar(36) NOT NULL, \
    `datetime` datetime NOT NULL, \
    `clientId` varchar(20) NOT NULL, \
    `url` varchar(255) NOT NULL, \
    `name` varchar(255) NOT NULL, \
    PRIMARY KEY (`id`), \
    UNIQUE KEY `id_UNIQUE` (`id`) \
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8; \
    \
    CREATE TABLE IF NOT EXISTS `users` ( \
    `id` varchar(36) NOT NULL, \
    `email` varchar(255) NOT NULL, \
    `password` varchar(255) NOT NULL, \
    PRIMARY KEY (`id`), \
    UNIQUE KEY `id_UNIQUE` (`id`) \
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8 \
  ',
    (err) => {
      if (err) {
        throw err;
      }
    });
};

createDefaults();

function Database() {}

Database.prototype.query = (query, values, callback) => {
  db.query(query, values, callback);
};

Database.prototype.createDefaults = createDefaults;

Database.prototype.now = () => {
  return moment().format('YYYY-MM-DD HH:mm:ss');
};

module.exports = Database;
