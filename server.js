const express = require('express');
const bodyParser = require('body-parser');
const youtubedl = require('youtube-dl');
const request = require('request');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const commandExists = require('command-exists');
const uuidv4 = require('uuid/v4');

const PORT = process.env.PORT || 8080;
const ENV = process.env.ENV || 'production';
const STATUS_INTERVAL = process.env.STATUS_INTERVAL || 1000;
const VIDEO_DELETION_INTERVAL = process.env.VIDEO_DELETION_INTERVAL || 3600000;
const TEMP_DELETION_INTERVAL = process.env.TEMP_DELETION_INTERVAL || 86400000;

const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

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

http.listen(PORT, () => {
  console.log('started server on port', PORT);
});

(() => {
  let transcodingProgress;
  let transcodingError;
  let environment;
  let guids = {};

  commandExists('ffmpeg', (err, commandExists) => {
    environment = {
      environment: ENV,
      ffmpeg: commandExists
    };
  });

  app.get('/', (req, res) => {
    res.render('pages/index');
  });

  io.on('connection', (socket) => {
    console.log('client connected');

    let id;

    socket.on('environment check', () => {
      io.emit('environment details', environment);
    });

    socket.on('download video', (url, requestedFormat) => {
      let video = youtubedl(url);
      let fileName;
      let filePath;
      let format = environment.ffmpeg ? requestedFormat : '';
      let x264Formats = ['mp4', 'mkv'];

      id = uuidv4();
      let tempFile = `videos/${id}.tmp`;

      video.on('info', (info) => {
        fileName = info._filename;
        if (format) {
          fileName = fileName.slice(0, -(info.ext.length));
          fileName += format;
          if (x264Formats.includes(info.ext) && x264Formats.includes(format)) {
            format = '';
          }
        }
        guids[id] = {
          fileName,
          fileSize: info.size
        };
        filePath = `videos/${fileName}`;
        console.log('downloading video', fileName);
        io.emit('video details', {
          fileName: fileName.slice(0, -((requestedFormat || info.ext).length + 1)),
          id
        });

        let statusCheck = setInterval(() => {
          let totalSize = guids[id].fileSize;
          let tempFile = `videos/${id}.tmp`;
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
            clearInterval(statusCheck);
          }

          let progress = status === 'transcoding' ? transcodingProgress : actualSize / totalSize;

          if (transcodingError) {
            socket.emit('transcoding error');
          } else {
            socket.emit('download progress', {
              progress,
              status
            });
          }
        }, STATUS_INTERVAL);
      });

      video.on('error', (err) => {
        console.log('error while downloading video', err);
        fs.unlink(tempFile);
        io.emit('download error');
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
  });

  app.get('/api/download_file', (req, res) => {
    let video = guids[req.query.id].fileName;
    let path = `videos/${video}`;
    let file = fs.createReadStream(path);
    let stat = fs.statSync(path);
    console.log('providing video to browser for download', video);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `attachment; filename=${video}`);
    file.pipe(res);
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
