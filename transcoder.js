const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const Logger = require('./logger');

const {
  FILE_DIR,
  FORMAT_ALIASES,
  FFMPEG_OPTIONS
} = require('./globals');

const logger = new Logger('transcoder');

function Transcoder(id, inputs, format) {
  this.command = null;
  this.progress = 0;
  this.id = id;
  this.inputs = inputs;
  this.format = format;
}

// public

Transcoder.prototype.getProgress = function() {
  return this.progress;
};

Transcoder.prototype.setFormat = function(format) {
  this.format = format;
};

Transcoder.prototype.kill = function() {
  if (this.command) {
    logger.warn('client disconnected, killing ffmpeg');
    this.command.kill('SIGKILL');
  }
};

Transcoder.prototype.convert = function() {
  logger.log('transcoding to', this.format);

  if (!FFMPEG_OPTIONS[this.format]) {
    return Promise.reject('Invalid format');
  }

  return this._ffmpeg(FFMPEG_OPTIONS[this.format]);
};

Transcoder.prototype.combine = function() {
  logger.log('combining video and audio files');
  return this._ffmpeg(FFMPEG_OPTIONS.combine);
};

Transcoder.prototype.getAudioFormat = function() {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(this.inputs[0], (err, metadata) => {
      if (err) {
        reject(err);
      } else {
        let format = metadata.streams.find((stream) => stream.codec_type === 'audio').codec_name;
        resolve(FORMAT_ALIASES[format] || format);
      }
    });
  });
};

Transcoder.prototype.extractAudio = function() {
  logger.log('extracting audio');
  return this._ffmpeg(FFMPEG_OPTIONS.audio);
};

// private

Transcoder.prototype._ffmpeg = function(options) {
  let output = `${FILE_DIR}/${this.id}.transcoding.${FORMAT_ALIASES[this.format] || this.format}`;
  return new Promise((resolve, reject) => {
    this.command = ffmpeg()
      .on('progress', (prog) => this.progress = prog.percent / 100)
      .on('error', (err) => {
        err = err.toString().replace('Error: ', '');
        logger.error('error when transcoding', err);
        reject(err);
      })
      .on('end', () => {
        logger.log('transcoding finished');
        resolve(output);
      });

    this.inputs.forEach((input) => this.command.input(input));
    this.command.inputOptions(options.params || []);

    Object.keys(options)
      .filter((option) => option !== 'params')
      .forEach((option) => this.command[option](options[option]));

    this.command.save(output);
  });
};

module.exports = Transcoder;
