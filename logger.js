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
    'extracting audio',
    'using proxy host'
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

function Logger(originator) {
  this.originator = originator;
}

['log', 'warn', 'error'].forEach((level) => {
  Logger.prototype[level] = function(message, data = '') {

    console[level](`${chalk.bold[COLOURS[level]](`[${level.toUpperCase()}]`)} ${this.originator}: ${message}`, data);

    let messageIndex = MESSAGES[level].indexOf(message);
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
module.exports.MESSAGES = MESSAGES;
