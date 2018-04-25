const mysql = require('mysql');
const moment = require('moment');
const { DbCreds } = require('./globals');

const db = mysql.createConnection(DbCreds);

// hack to keep the db connection alive
setInterval(() => {
  db.query('SELECT 1');
}, 10000);

function Database() {}

Database.prototype.createDefaults = () => {
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
    `url` varchar(255) NOT NULL, \
    `name` varchar(255) NOT NULL, \
    PRIMARY KEY (`id`), \
    UNIQUE KEY `id_UNIQUE` (`id`) \
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8',
    (err) => {
      if (err) {
        throw err;
      }
    });
};

Database.prototype.query = (query, values) => {
  return new Promise((resolve, reject) => {
    db.query(query, values, (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results);
      }
    });
  });
};

Database.prototype.now = () => moment().format('YYYY-MM-DD HH:mm:ss');

let { createDefaults } = Database.prototype;

createDefaults();

module.exports = Database;
