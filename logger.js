const chalk = require('chalk');

const Database = require('./database');

const db = new Database();

const COLOURS = {
  log: 'blue',
  warn: 'yellow',
  error: 'red'
};

const MESSAGES = {
  log: [
    'dev mode, allowing any origin to access API',
    'started server on port',
    'client connected',
    'client disconnected',
    'downloading file',
    'file finished downloading',
    'transcoding to',
    'transcoding finished',
    'combining video and audio files',
    'providing file to browser for download',
    'successful admin login',
    'providing db to browser for download',
    'deleted db dump',
    'deleted all db dumps',
    'dumped database to file',
    'deleting old downloaded files'
  ],
  warn: [
    'client disconnected, cancelling download',
    'client disconnected, killing ffmpeg',
    'admin login attempt'
  ],
  error: [
    'an error occured',
    'error while downloading file',
    'error when transcoding',
    'error when combining files'
  ]
};

function Logger(env, io) {
  this.env = env;
  this.io = io;
}

['log', 'warn', 'error'].forEach((level) => {
  Logger.prototype[level] = function(message, data) {
    data = data || '';

    if (this.env === 'development') {
      this.io.emit('server log', level, MESSAGES[level][message], data);
    }

    console[level](`${chalk.bold[COLOURS[level]](`[${level.toUpperCase()}]`)} ${MESSAGES[level][message]}`, data);

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
module.exports.Messages = MESSAGES;
