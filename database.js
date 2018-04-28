const mysql = require('mysql');
const moment = require('moment');
const { DbCreds } = require('./globals');

const db = mysql.createConnection(DbCreds);

function Database() {
  this.createDefaults = () => {
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

  this.createDefaults();
}

Database.prototype.createDefaults = function() {
  this.createDefaults();
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

Database.prototype.keepAlive = () => db.query('SELECT 1');

module.exports = Database;
