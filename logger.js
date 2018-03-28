const chalk = require('chalk');
const fs = require('fs');
const moment = require('moment');
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
    let datetime = moment(new Date()).format('YYYY-MM-DD HH:mm:ss');

    console[level](`${chalk.bold[COLOURS[level]](`[${level.toUpperCase()}]`)} ${message}`, data);

    db.query(`INSERT INTO logs (datetime, level, message, data) VALUES ('${datetime}', '${level}', '${message}', '${JSON.stringify(data)}')`, (err) => {
      if (err) {
        throw err;
      }
    });
  };
});

module.exports = Logger;
