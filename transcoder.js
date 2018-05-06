const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const Logger = require('./logger');

const { FILE_DIR } = require('./globals');

const logger = new Logger('transcoder');

function Transcoder() {
  this.command = null;
  this.progress = 0;
}

// public

Transcoder.prototype.getProgress = function() {
  return this.progress;
};

Transcoder.prototype.kill = function(files) {
  if (this.command) {
    logger.warn('client disconnected, killing ffmpeg');
    this.command.kill('SIGKILL');
    files.forEach((file) => {
      if (fs.existsSync(file)) {
        fs.unlink(file);
      }
    });
  }
};

Transcoder.prototype.convert = function(id, inputFile, format) {
  logger.log('transcoding to', format);

  let outputFile = `${FILE_DIR}/${id}.transcoding.${format}`;
  let options = null;

  switch (format) {
    case 'mp4':
    case 'mkv':
      options = {
        videoCodec: 'libx264'
      };
      break;
    case 'mp3':
      options = {
        noVideo: '',
        audioBitrate: '192k',
        audioCodec: 'libmp3lame',
      };
      break;
    case 'wav':
      options = {
        noVideo: '',
        audioFrequency: 44100,
        audioChannels: 2,
        audioCodec: 'pcm_s16le'
      };
      break;
    case 'webm':
      options = {
        noVideo: '',
        audioChannels: 2,
        audioCodec: 'libvorbis'
      };
      break;
    default:
      return;
  }

  return this._ffmpeg([inputFile], options, outputFile);
};

Transcoder.prototype.combine = function(id, inputVideoFile, inputAudioFile, format) {
  logger.log('combining video and audio files');

  let outputFile = `${FILE_DIR}/${id}.transcoding.${format}`;
  let options = {
    videoCodec: 'copy'
  };

  return this._ffmpeg([inputVideoFile, inputAudioFile], options, outputFile);
};

Transcoder.prototype.getAudioFormat = (inputFile) => {
  let aliases = {
    vorbis: 'ogg'
  };

  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputFile, (err, metadata) => {
      if (err) {
        reject(err);
      } else {
        let format = metadata.streams.find((stream) => stream.codec_type === 'audio').codec_name
        resolve(aliases[format] || format);
      }
    });
  });
};

Transcoder.prototype.extractAudio = function(id, inputFile, format) {
  logger.log('extracting audio');

  let outputFile = `${FILE_DIR}/${id}.transcoding.${format}`;
  let options = {
    noVideo: '',
    audioChannels: 2,
    audioCodec: 'copy'
  };

  return this._ffmpeg([inputFile], options, outputFile);
};

// private

Transcoder.prototype._handleProgress = function(prog) {
  this.progress = prog.percent / 100;
};

Transcoder.prototype._handleEnd = function(callback) {
  logger.log('transcoding finished');
  callback();
};

Transcoder.prototype._ffmpeg = function(inputs, options, output) {
  return new Promise((resolve, reject) => {
    this.command = ffmpeg()
      .on('progress', this._handleProgress.bind(this))
      .on('error', reject)
      .on('end', this._handleEnd.bind(null, resolve.bind(null, output)));

    inputs.forEach((input) => this.command.input(input));
    Object.keys(options).forEach((option) => this.command[option](options[option]));

    this.command.save(output);
  });
};

module.exports = Transcoder;
