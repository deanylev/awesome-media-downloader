const express = require('express');
const bodyParser = require('body-parser');
const youtubedl = require('youtube-dl');
const request = require('request');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const commandExists = require('command-exists');

const PORT = process.env.PORT || 8080;
const ENV = process.env.ENV || 'production';
const STATUS_INTERVAL = process.env.STATUS_INTERVAL || 1000;
const VIDEO_DELETION_INTERVAL = process.env.VIDEO_DELETION_INTERVAL || 3600000;
const TEMP_DELETION_INTERVAL = process.env.TEMP_DELETION_INTERVAL || 86400000;

const app = express();

app.listen(PORT);
console.log('started server on port', PORT)
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(bodyParser.urlencoded({
  extended: true
}));

if (ENV === 'development') {
  console.log('dev mode, allowing any origin to access API');
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    next();
  });
}

(() => {
  let transcodingProgress;
  let transcodingError;
  let environment;

  app.get('/', (req, res) => {
    res.render('pages/index');
  });

  app.get('/api/environment', (req, res) => {
    commandExists('ffmpeg', (err, commandExists) => {
      environment = {
        environment: ENV,
        statusInterval: STATUS_INTERVAL,
        ffmpeg: commandExists
      };
      res.json(environment);
    });
  });

  app.post('/api/download', (req, res) => {
    let video = youtubedl(req.body.url);
    let tempFile = `videos/${Math.random().toString(36).substring(2)}.tmp`;
    let fileName;
    let filePath;
    let format = environment.ffmpeg ? req.body.format : '';
    let x264Formats = ['mp4', 'mkv'];

    video.on('info', (info) => {
      fileName = info._filename;
      if (format) {
        fileName = fileName.slice(0, -(info.ext.length));
        fileName += format;
        if (x264Formats.includes(info.ext) && x264Formats.includes(format)) {
          format = '';
        }
      }
      filePath = `videos/${fileName}`;
      console.log('downloading video', fileName);
      res.json({
        fileName,
        fileSize: info.size,
        tempFile,
        extension: req.body.format || info.ext
      });
    });

    video.on('error', (err) => {
      console.log('error while downloading video', err);
      fs.unlink(tempFile);
      res.sendStatus(500);
    });

    video.pipe(fs.createWriteStream(tempFile));

    video.on('end', () => {
      console.log('video finished downloading', fileName);
      if (format) {
        console.log(`transcoding to ${format}`);
        let command;
        switch (format) {
          case 'mp4':
          case 'mkv':
            ffmpeg(tempFile).videoCodec('libx264').on('progress', (progress) => {
              transcodingProgress = progress.percent / 100;
            }).on('error', () => {
              transcodingError = true;
            }).on('end', () => {
              fs.unlink(tempFile);
              console.log('transcoding finished');
            }).save(filePath);
            break;
          case 'mp3':
            ffmpeg(tempFile).noVideo().audioBitrate('192k').audioChannels(2).audioCodec('libmp3lame').on('progress', (progress) => {
              transcodingProgress = progress.percent / 100;
            }).on('error', () => {
              transcodingError = true;
            }).on('end', () => {
              fs.unlink(tempFile);
              console.log('transcoding finished');
            }).save(filePath);
            break;
          case 'wav':
            ffmpeg(tempFile).noVideo().audioFrequency(44100).audioChannels(2).audioCodec('pcm_s16le').on('progress', (progress) => {
              transcodingProgress = progress.percent / 100;
            }).on('error', () => {
              transcodingError = true;
            }).on('end', () => {
              fs.unlink(tempFile);
              console.log('transcoding finished');
            }).save(filePath);
            break;
          default:
            transcodingError = true;
        }
      } else {
        fs.rename(tempFile, filePath);
      }
    });
  });

  app.get('/api/download_file', (req, res) => {
    let video = decodeURIComponent(req.query.video);
    let path = `videos/${video}`;
    let file = fs.createReadStream(path);
    let stat = fs.statSync(path);
    console.log('providing video to browser for download', req.query.video);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Type', 'video/webm');
    res.setHeader('Content-Disposition', `attachment; filename=${video}`);
    file.pipe(res);
  });

  app.get('/api/download_status', (req, res) => {
    let totalSize = parseInt(req.query.fileSize);
    let tempFile = decodeURIComponent(req.query.tempFile);
    let actualSize;
    let status;

    if (fs.existsSync(tempFile)) {
      actualSize = fs.statSync(tempFile).size;
      if (actualSize === totalSize) {
        status = 'transcoding'
      } else {
        status = 'downloading';
      }
    } else {
      actualSize = totalSize;
      status = 'complete';
    }

    let progress = status === 'transcoding' ? transcodingProgress : actualSize / totalSize;

    if (transcodingError) {
      res.sendStatus(500);
    } else {
      res.json({
        status,
        progress
      });
    }
  });
})();

setInterval(() => {
  console.log('deleting unused videos');
  fs.readdir('videos', (err, files) => {
    for (const file of files) {
      if (!(file.endsWith('.tmp') || file === '.gitkeep')) {
        fs.unlink(`videos/${file}`);
      }
    }
  });
}, VIDEO_DELETION_INTERVAL);

setInterval(() => {
  console.log('deleting tmp files');
  fs.readdir('videos', (err, files) => {
    for (const file of files) {
      if (file.endsWith('.tmp')) {
        fs.unlink(`videos/${file}`);
      }
    }
  });
}, TEMP_DELETION_INTERVAL);
