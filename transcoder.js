const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const Logger = require('./logger');

const { FILE_DIR } = require('./globals');

const logger = new Logger('transcoder');

function Transcoder() {
  this.command = null;
  this.progress = 0;

  this.handleProgress = (prog) => this.progress = prog.percent / 100;
}

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
  return new Promise((resolve, reject) => {
    logger.log('transcoding to', format);

    let outputFile = `${FILE_DIR}/${id}.transcoding.${format}`;
    let handleEnd = () => {
      logger.log('transcoding finished');
      resolve(outputFile);
    };

    switch (format) {
      case 'mp4':
      case 'mkv':
         this.command = ffmpeg(inputFile)
          .videoCodec('libx264')
          .on('progress', this.handleProgress)
          .on('error', reject)
          .on('end', handleEnd)
          .save(outputFile);
        break;
      case 'mp3':
         this.command = ffmpeg(inputFile)
          .noVideo()
          .audioBitrate('192k')
          .audioChannels(2)
          .audioCodec('libmp3lame')
          .on('progress', this.handleProgress)
          .on('error', reject)
          .on('end', handleEnd)
          .save(outputFile);
        break;
      case 'wav':
         this.command = ffmpeg(inputFile)
          .noVideo()
          .audioFrequency(44100)
          .audioChannels(2)
          .audioCodec('pcm_s16le')
          .on('progress', this.handleProgress)
          .on('error', reject)
          .on('end', handleEnd)
          .save(outputFile);
        break;
      case 'webm':
         this.command = ffmpeg(inputFile)
          .noVideo()
          .audioChannels(2)
          .audioCodec('libvorbis')
          .on('progress', this.handleProgress)
          .on('error', reject)
          .on('end', handleEnd)
          .save(outputFile);
        break;
      default:
        transcodingError = true;
    }
  });
};

Transcoder.prototype.combine = function(id, inputVideoFile, inputAudioFile, format) {
  return new Promise((resolve, reject) => {
    logger.log('combining video and audio files');

    let outputFile = `${FILE_DIR}/${id}.transcoding.${format}`;
    let handleEnd = () => {
      logger.log('transcoding finished');
      resolve(outputFile);
    };

    this.command = ffmpeg()
      .videoCodec('copy')
      .input(inputVideoFile)
      .input(inputAudioFile)
      .on('progress', this.handleProgress)
      .on('error', reject)
      .on('end', handleEnd)
      .save(outputFile);
  });
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
  return new Promise((resolve, reject) => {
    logger.log('extracting audio');

    let outputFile = `${FILE_DIR}/${id}.transcoding.${format}`;
    let handleEnd = () => {
      logger.log('transcoding finished');
      resolve(outputFile);
    };

     this.command = ffmpeg(inputFile)
      .noVideo()
      .audioChannels(2)
      .audioCodec('copy')
      .on('progress', this.handleProgress)
      .on('error', reject)
      .on('end', handleEnd)
      .save(outputFile);
  });
};

module.exports = Transcoder;
