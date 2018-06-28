/* eslint no-console: 'off' */

// our libraries
const db = require('./database');

// third party libraries
const chalk = require('chalk');

// globals
const {
  LOGGER
} = require('./globals');

function Logger(originator) {
  this.originator = originator;
}

LOGGER.levels.forEach((level) => {
  Logger.prototype[level] = function(message, data = '') {

    console[level](`${chalk.bold[LOGGER.colours[level]](`[${level.toUpperCase()}]`)} ${this.originator}: ${message}`, data);

    const levelIndex = LOGGER.levels.indexOf(level);
    const originatorIndex = LOGGER.originators.indexOf(this.originator);
    const messageIndex = LOGGER.messages[level].indexOf(message);
    if (levelIndex === -1) {
      throw new Error(`Level '${level}' has no defined index.`);
    } else if (originatorIndex === -1) {
      throw new Error(`Originator '${this.originator}' has no defined index`);
    } else if (messageIndex === -1) {
      throw new Error(`Message '${message}' has no defined index.`);
    }

    db.query('INSERT INTO logs SET ?', {
      datetime: db.now(),
      level: levelIndex,
      originator: originatorIndex,
      message: messageIndex,
      data: JSON.stringify(data)
    });
  };
});

module.exports = Logger;
