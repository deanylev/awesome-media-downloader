// our libraries
const db = require('./database');

// third party libraries
const chalk = require('chalk');

// globals
const {
  LOGGER_COLOURS,
  LOGGER_MESSAGES
} = require('./globals');

function Logger(originator) {
  this.originator = originator;
}

['log', 'warn', 'error'].forEach((level) => {
  Logger.prototype[level] = function(message, data = '') {

    console[level](`${chalk.bold[LOGGER_COLOURS[level]](`[${level.toUpperCase()}]`)} ${this.originator}: ${message}`, data);

    let messageIndex = LOGGER_MESSAGES[level].indexOf(message);
    if (messageIndex === -1) {
      throw new Error('Message has no defined index');
    }

    db.query('INSERT INTO logs SET ?', {
      datetime: db.now(),
      level,
      originator: this.originator,
      message: messageIndex,
      data: JSON.stringify(data)
    });
  };
});

module.exports = Logger;
