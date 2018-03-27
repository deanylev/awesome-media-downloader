const chalk = require('chalk');
const fs = require('fs');
const moment = require('moment');

const COLOURS = {
  log: 'blue',
  warn: 'yellow',
  error: 'red'
};

function Logger() {}

['log', 'warn', 'error'].forEach((level) => {
  Logger.prototype[level] = (message, data) => {
    let logFile = fs.createWriteStream(`logs/${moment().format('YYYYMMDD')}.log`, {
      flags: 'a'
    });
    console[level](`${chalk.bold[COLOURS[level]](`[${level.toUpperCase()}]`)} ${message}`, data || '');
    logFile.write(`${JSON.stringify({
      time: moment().format('LTS'),
      level,
      message,
      data
    })}\n`);
  };
});

module.exports = Logger;
