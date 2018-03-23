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
    let logFile = `logs/${moment().format('YYYYMMDD')}.log`;
    if (!fs.existsSync(logFile)) {
      fs.createWriteStream(logFile);
    }
    let file = fs.createWriteStream(logFile, {
      flags: 'a'
    });
    console[level](`${chalk[COLOURS[level]](`[${level.toUpperCase()}]`)} ${message}`, data || '');
    file.write(`${JSON.stringify({
      time: moment().format('LTS'),
      message,
      data
    })}\n`);
  };
});

module.exports = Logger;
