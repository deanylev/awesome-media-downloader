const mysql = require('mysql');

const db = mysql.createConnection({
  host: process.env.CLEARDB_DATABASE_URL || 'localhost',
  user: process.env.DATABASE_USER || 'root',
  password: process.env.DATABASE_PASSWORD || '',
  database: process.env.DATABASE_NAME || 'awesome_media_downloader'
});

let createDefaults = () => {
  db.query(
  'CREATE TABLE IF NOT EXISTS `logs` ( \
    `id` int(11) NOT NULL AUTO_INCREMENT, \
    `datetime` datetime NOT NULL, \
    `level` varchar(10) NOT NULL, \
    `message` mediumtext NOT NULL, \
    `data` mediumtext, \
    PRIMARY KEY (`id`), \
    UNIQUE KEY `id_UNIQUE` (`id`) \
  ) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8',
  (err) => {
    if (err) {
      throw err;
    }
  });
}

createDefaults();

function Database() {}

Database.prototype.query = (query, callback) => {
  db.query(query, callback);
};

Database.prototype.createDefaults = createDefaults;

module.exports = Database;
