const chalk = require('chalk');

const Database = require('./database');

const db = new Database();

const COLOURS = {
  log: 'blue',
  warn: 'yellow',
  error: 'red'
};

function Logger(env, io) {
  this.env = env;
  this.io = io;
}

['log', 'warn', 'error'].forEach((level) => {
  Logger.prototype[level] = function(message, data) {
    data = data || '';

    if (this.env === 'development') {
      this.io.emit('server log', level, message, data);
    }

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
