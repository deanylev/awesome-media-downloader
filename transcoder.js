const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const Logger = require('./logger');

const { FILE_DIR } = require('./globals');
const OPTIONS = {
  mp4: {
    videoCodec: 'libx264'
  },
  mkv: {
    videoCodec: 'libx264'
  },
  mp3: {
    noVideo: '',
    audioBitrate: '192k',
    audioCodec: 'libmp3lame',
  },
  wav: {
    noVideo: '',
    audioFrequency: 44100,
    audioChannels: 2,
    audioCodec: 'pcm_s16le'
  },
  webm: {
    noVideo: '',
    audioChannels: 2,
    audioCodec: 'libvorbis'
  },
  audio: {
    noVideo: '',
    audioChannels: 2,
    audioCodec: 'copy'
  },
  combine: {
    videoCodec: 'copy'
  }
};

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

Transcoder.prototype.convert = function() {
  logger.log('transcoding to', this.format);

  if (!OPTIONS[this.format]) {
    return;
  }

  return this._ffmpeg(OPTIONS[this.format]);
};

Transcoder.prototype.combine = function() {
  logger.log('combining video and audio files');
  return this._ffmpeg(OPTIONS.combine);
};

Transcoder.prototype.getAudioFormat = function() {
  let aliases = {
    vorbis: 'ogg'
  };

  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(this.inputs[0], (err, metadata) => {
      if (err) {
        reject(err);
      } else {
        let format = metadata.streams.find((stream) => stream.codec_type === 'audio').codec_name;
        resolve(aliases[format] || format);
      }
    });
  });
};

Transcoder.prototype.extractAudio = function() {
  logger.log('extracting audio');
  return this._ffmpeg(OPTIONS.audio);
};

// private

Transcoder.prototype._ffmpeg = function(options) {
  let output = `${FILE_DIR}/${this.id}.transcoding.${this.format}`;
  return new Promise((resolve, reject) => {
    this.command = ffmpeg()
      .on('progress', (prog) => this.progress = prog.percent / 100)
      .on('error', reject)
      .on('end', () => {
        logger.log('transcoding finished');
        resolve(output);
      });

    this.inputs.forEach((input) => this.command.input(input));
    Object.keys(options).forEach((option) => this.command[option](options[option]));

    this.command.save(output);
  });
};

module.exports = Transcoder;
