const chalk = require('chalk');

const colours = {
  log: 'blue',
  warn: 'yellow',
  error: 'red'
};

function Logger() {}

['log', 'warn', 'error'].forEach((level) => {
  Logger.prototype[level] = (message, data) => {
    console[level](`${chalk[colours[level]](`[${level.toUpperCase()}]`)} ${message}`, data || '');
  };
});

module.exports = Logger;
