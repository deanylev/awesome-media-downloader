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
const FILE_DELETION_INTERVAL = process.env.FILE_DELETION_INTERVAL || 3600000;
const TEMP_DELETION_INTERVAL = process.env.TEMP_DELETION_INTERVAL || 86400000;

const VIDEO_FORMATS = ['mp4', 'mkv'];
const AUDIO_FORMATS = ['mp3', 'wav'];

const FILE_DIRECTORY = 'files';

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
      ffmpeg: commandExists,
      videoFormats: VIDEO_FORMATS,
      audioFormats: AUDIO_FORMATS
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

    socket.on('download file', (url, requestedFormat, requestedQuality) => {
      id = uuidv4();
      let tempFile = `files/${id}.tmp`;
      let tempFileAudio;
      let options = [];
      if (requestedQuality === 'best') {
        options.push('-f', 'bestvideo');
        let audio = youtubedl(url, ['-f', 'bestaudio']);
        tempFileAudio = `${tempFile}audio`;
        audio.pipe(fs.createWriteStream(tempFileAudio));
      }
      let file = youtubedl(url, options);
      let fileName;
      let filePath;
      let format = environment.ffmpeg ? requestedFormat : '';
      let x264Formats = ['mp4', 'mkv'];
      let originalFormat;

      file.on('info', (info) => {
        fileName = `${info.title}.`;
        if (format && (VIDEO_FORMATS.includes(format) || AUDIO_FORMATS.includes(format))) {
          fileName += format;
          if (x264Formats.includes(info.ext) && x264Formats.includes(format)) {
            format = '';
          }
        } else {
          fileName += info.ext;
          format = '';
        }
        originalFormat = info.ext;
        guids[id] = {
          url,
          originalFormat,
          fileName,
          fileSize: info.size
        };
        filePath = `${FILE_DIRECTORY}/${fileName}`;
        console.log('downloading file', fileName);
        io.emit('file details', {
          fileName: fileName.slice(0, -((requestedFormat || info.ext).length + 1)),
          id
        });

        transcodingError = false;

        let statusCheck = setInterval(() => {
          let totalSize = guids[id].fileSize;
          let tempFile = `${FILE_DIRECTORY}/${id}.tmp`;
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

          guids[id].status = status;
          guids[id].progress = progress;

          if (transcodingError) {
            socket.emit('transcoding error');
            clearInterval(statusCheck);
          } else {
            socket.emit('download progress', {
              progress,
              status
            });
          }
        }, STATUS_INTERVAL);
      });

      file.on('error', (err) => {
        console.log('error while downloading file', err);
        fs.unlink(tempFile);
        io.emit('download error');
      });

      file.pipe(fs.createWriteStream(tempFile));

      file.on('end', () => {
        console.log('file finished downloading', fileName);
        let command;
        if (format) {
          console.log(`transcoding to ${format}`);
          switch (format) {
            case 'mp4':
            case 'mkv':
              command = ffmpeg(tempFile).videoCodec('libx264').on('progress', (progress) => {
                transcodingProgress = progress.percent / 100;
              }).on('error', () => {
                transcodingError = true;
              }).on('end', () => {
                fs.unlink(tempFile);
                console.log('transcoding finished');
              }).save(filePath);
              break;
            case 'mp3':
              command = ffmpeg(tempFile).noVideo().audioBitrate('192k').audioChannels(2).audioCodec('libmp3lame').on('progress', (progress) => {
                transcodingProgress = progress.percent / 100;
              }).on('error', () => {
                transcodingError = true;
              }).on('end', () => {
                fs.unlink(tempFile);
                console.log('transcoding finished');
              }).save(filePath);
              break;
            case 'wav':
              command = ffmpeg(tempFile).noVideo().audioFrequency(44100).audioChannels(2).audioCodec('pcm_s16le').on('progress', (progress) => {
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
        } else if (requestedQuality === 'best') {
          console.log('combining video and audio files');
          let videoCodec = originalFormat === 'webm' ? 'libvpx' : 'libx264';
          command = ffmpeg().videoCodec(videoCodec).input(tempFile).input(tempFileAudio).on('progress', (progress) => {
            transcodingProgress = progress.percent / 100;
          }).on('error', (err) => {
            console.log('error when combining files', err);
            transcodingError = true;
          }).on('end', () => {
            fs.unlink(tempFile);
            fs.unlink(tempFileAudio);
            console.log('transcoding finished');
          }).save(filePath);
        } else {
          fs.rename(tempFile, filePath);
        }

        if (command) {
          let killTranscoder = () => {
            console.log('client disconnected, killing ffmpeg')
            command.kill('SIGKILL');
            fs.unlink(tempFile);
            if (tempFileAudio) {
              fs.unlink(tempFileAudio);
            }
            fs.unlink(filePath);
            socket.removeListener('disconnect', killTranscoder);
          }

          socket.on('disconnect', killTranscoder);
        }
      });
    });
  });

  app.get('/api/download_file', (req, res) => {
    let fileName = guids[req.query.id].fileName;
    let path = `${FILE_DIRECTORY}/${fileName}`;
    let file = fs.createReadStream(path);
    let stat = fs.statSync(path);
    console.log('providing file to browser for download', fileName);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    file.pipe(res);
  });

  app.get('/api/admin', (req, res) => {
    let ip = req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(', ')[0] : req.connection.remoteAddress;

    if (ENV === 'development' || ip === process.env.ADMIN_IP) {
      res.json({
        files: guids
      });
    } else {
      res.sendStatus(401);
    }
  });
})();

setInterval(() => {
  console.log('deleting unused files');
  fs.readdir(FILE_DIRECTORY, (err, files) => {
    for (const file of files) {
      if (!(file.endsWith('.tmp') || file === '.gitkeep')) {
        fs.unlink(`${FILE_DIRECTORY}/${file}`);
      }
    }
  });
}, FILE_DELETION_INTERVAL);

setInterval(() => {
  console.log('deleting tmp files');
  fs.readdir(FILE_DIRECTORY, (err, files) => {
    for (const file of files) {
      if (file.endsWith('.tmp')) {
        fs.unlink(`${FILE_DIRECTORY}/${file}`);
      }
    }
  });
}, TEMP_DELETION_INTERVAL);
