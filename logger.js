const chalk = require('chalk');
const db = require('./database');

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
    'deleting old downloaded files',
    'received download request',
    'client connected to admin socket',
    'set config var',
    'downloading audio track',
    'audio track finished downloading',
    'requested format is audio, requesting audio only',
    'extracting audio'
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

function Logger(originator, env, io) {
  this.originator = originator;
  this.env = env;
  this.io = io;
}

['log', 'warn', 'error'].forEach((level) => {
  Logger.prototype[level] = function(message, data) {
    data = data || '';

    if (this.env === 'development') {
      this.io.emit('server log', level, this.originator, message, data);
    }

    console[level](`${chalk.bold[COLOURS[level]](`[${level.toUpperCase()}]`)} ${this.originator}: ${message}`, data);

    db.query('INSERT INTO logs SET ?', {
      datetime: db.now(),
      level,
      originator: this.originator,
      message: MESSAGES[level].indexOf(message),
      data: JSON.stringify(data)
    });
  };
});

module.exports = Logger;
module.exports.MESSAGES = MESSAGES;
