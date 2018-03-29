const chalk = require('chalk');

const Database = require('./database');

const db = new Database();

const COLOURS = {
  log: 'blue',
  warn: 'yellow',
  error: 'red'
};

function Logger() {}

['log', 'warn', 'error'].forEach((level) => {
  Logger.prototype[level] = (message, data) => {
    data = data || '';

    console[level](`${chalk.bold[COLOURS[level]](`[${level.toUpperCase()}]`)} ${message}`, data);

    let sqlValues = {
      datetime: db.now(),
      level,
      message,
      data: JSON.stringify(data)
    };

    db.query('INSERT INTO logs SET ?', sqlValues, (err) => {
      if (err) {
        throw err;
      }
    });
  };
});

module.exports = Logger;
