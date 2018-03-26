const express = require('express');
const bodyParser = require('body-parser');
const youtubedl = require('youtube-dl');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const commandExists = require('command-exists');
const uuidv4 = require('uuid/v4');
const auth = require('basic-auth');
const mime = require('mime-types');
const os = require('os-utils');
const Heroku = require('heroku-client');
const Logger = require('./logger');

const PORT = process.env.PORT || 8080;
const ENV = process.env.ENV || 'production';
const STATUS_INTERVAL = process.env.STATUS_INTERVAL || 1000;
const FILE_DELETION_INTERVAL = process.env.FILE_DELETION_INTERVAL || 3600000;
const ALLOW_FORMAT_SELECTION = !!process.env.ALLOW_FORMAT_SELECTION;
const ALLOW_QUALITY_SELECTION = !!process.env.ALLOW_QUALITY_SELECTION;
const ALLOW_REQUESTED_NAME = !!process.env.ALLOW_REQUESTED_NAME;
const ON_HEROKU = !!process.env.ON_HEROKU;
const {
  ADMIN_USERNAME,
  ADMIN_PASSWORD,
  HEROKU_APP_NAME
} = process.env;

const VIDEO_FORMATS = ['mp4', 'mkv'];
const AUDIO_FORMATS = ['mp3', 'wav'];

const FILE_DIR = 'files';
const TMP_EXT = 'inprogress';
const FINAL_EXT = 'complete';

const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const logger = new Logger();
const heroku = new Heroku({
  token: process.env.HEROKU_API_TOKEN
});

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(bodyParser.urlencoded({
  extended: true
}));

if (ENV === 'development') {
  logger.log('dev mode, allowing any origin to access API');
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    next();
  });
}

http.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    logger.error(`port ${PORT} is in use. ${process.env.PORT ? '' : `kill whatever is running on port ${PORT} or set the PORT env variable to something different.`}`);
  } else {
    logger.error('an error occured', err);
  }
  process.exit();
});

http.listen(PORT, () => {
  logger.log('started server on port', PORT);
});

(() => {
  let environment;
  let files = {};

  commandExists('ffmpeg', (err, commandExists) => {
    environment = {
      environment: ENV,
      ffmpeg: commandExists,
      onHeroku: ON_HEROKU,
      allowFormatSelection: ALLOW_FORMAT_SELECTION,
      allowQualitySelection: ALLOW_QUALITY_SELECTION,
      videoFormats: VIDEO_FORMATS,
      audioFormats: AUDIO_FORMATS,
      allowRequestedName: ALLOW_REQUESTED_NAME
    };
  });

  app.get('/', (req, res) => {
    res.render('pages/index');
  });

  io.on('connection', (socket) => {
    logger.log('client connected', socket.id);

    socket.on('disconnect', () => {
      logger.log('client disconnected', socket.id);
    });

    let id;
    let transcodingProgress = 0;
    let transcodingError;

    socket.on('environment check', () => {
      io.emit('environment details', environment);
    });

    if (ALLOW_REQUESTED_NAME) {
      socket.on('file title', (url, index) => {
        youtubedl.getInfo(url, (err, info) => {
          let title = err ? 'Not a valid URL' : info.title;
          io.emit('file title', title, index);
        });
      });
    }

    socket.on('download file', (url, requestedFormat, requestedQuality, requestedName) => {
      id = uuidv4();
      requestedFormat = requestedFormat === 'none' ? '' : requestedFormat;
      requestedQuality = requestedQuality === 'none' ? '' : requestedQuality;
      let tempFile = `files/${id}.${TMP_EXT}`;
      let tempFileAudio;
      let options = [];
      if (requestedQuality === 'best' && ALLOW_QUALITY_SELECTION) {
        options.push('-f', 'bestvideo');
        let audio = youtubedl(url, ['-f', 'bestaudio']);
        tempFileAudio = `${tempFile}audio`;
        audio.pipe(fs.createWriteStream(tempFileAudio));
      }
      let file = youtubedl(url, options);
      let fileName;
      let filePath;
      let format = environment.ffmpeg && ALLOW_FORMAT_SELECTION ? requestedFormat : '';
      let x264Formats = ['mp4', 'mkv'];
      let originalFormat;
      let cancelDownload = () => {
        if (fs.existsSync(`${FILE_DIR}/${id}.${TMP_EXT}`)) {
          logger.warn('client disconnected, cancelling download');
          fs.unlink(`${FILE_DIR}/${id}.${TMP_EXT}`);
          file.pause();
          file.unpipe();
        }
      };

      file.on('info', (info) => {
        socket.on('disconnect', cancelDownload);
        fileName = requestedName && ALLOW_REQUESTED_NAME ? `${requestedName}.` : `${info.title}.`;
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
        files[id] = {
          url,
          originalFormat,
          name: fileName,
          fileSize: info.size
        };
        filePath = `${FILE_DIR}/${id}.${FINAL_EXT}`;
        logger.log('downloading file', fileName);
        io.emit('file details', {
          fileName: fileName.slice(0, -((requestedFormat || info.ext).length + 1)),
          id
        });

        transcodingError = false;

        let statusCheck = setInterval(() => {
          let totalSize = files[id].fileSize;
          let tempFile = `${FILE_DIR}/${id}.${TMP_EXT}`;
          let actualSize;
          let status;

          if (fs.existsSync(tempFile)) {
            actualSize = fs.statSync(tempFile).size;
            if (actualSize === totalSize) {
              status = 'transcoding';
            } else {
              status = 'downloading';
            }
          } else {
            actualSize = totalSize;
            status = 'complete';
            clearInterval(statusCheck);
          }

          let progress = status === 'transcoding' ? transcodingProgress : actualSize / totalSize;
          progress = progress > 1 ? 1 : progress;

          files[id].status = status;
          files[id].progress = progress;

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
        logger.error('error while downloading file', err.toString());
        fs.unlink(tempFile);
        io.emit('download error');
      });

      file.pipe(fs.createWriteStream(tempFile));

      file.on('end', () => {
        socket.removeListener('disconnect', cancelDownload);
        logger.log('file finished downloading', fileName);
        let command;
        let outputFile = `files/${id}.transcoding.${format || originalFormat}`;
        if (format) {
          logger.log(`transcoding to ${format}`);
          let conversionError = (err) => {
            err = err.toString();
            // XXX string matching isn't great, but no way to avoid the error
            if (err !== 'Error: ffmpeg was killed with signal SIGKILL') {
              logger.error('error when transcoding', err);
              transcodingError = true;
            }
          };
          let finishConversion = () => {
            fs.unlink(tempFile);
            fs.rename(outputFile, filePath);
            logger.log('transcoding finished');
          };
          switch (format) {
            case 'mp4':
            case 'mkv':
              command = ffmpeg(tempFile).videoCodec('libx264').on('progress', (progress) => {
                transcodingProgress = progress.percent / 100;
              }).on('error', (err) => {
                conversionError(err);
              }).on('end', () => {
                finishConversion();
              }).save(outputFile);
              break;
            case 'mp3':
              command = ffmpeg(tempFile).noVideo().audioBitrate('192k').audioChannels(2).audioCodec('libmp3lame').on('progress', (progress) => {
                transcodingProgress = progress.percent / 100;
              }).on('error', (err) => {
                conversionError(err);
              }).on('end', () => {
                finishConversion();
              }).save(outputFile);
              break;
            case 'wav':
              command = ffmpeg(tempFile).noVideo().audioFrequency(44100).audioChannels(2).audioCodec('pcm_s16le').on('progress', (progress) => {
                transcodingProgress = progress.percent / 100;
              }).on('error', (err) => {
                conversionError(err);
              }).on('end', () => {
                finishConversion();
              }).save(outputFile);
              break;
            default:
              transcodingError = true;
          }
        } else if (requestedQuality === 'best' && ALLOW_QUALITY_SELECTION) {
          logger.log('combining video and audio files');
          let videoCodec = originalFormat === 'webm' ? 'libvpx' : 'libx264';
          command = ffmpeg().videoCodec(videoCodec).input(tempFile).input(tempFileAudio).on('progress', (progress) => {
            transcodingProgress = progress.percent / 100;
          }).on('error', (err) => {
            logger.error('error when combining files', err);
            transcodingError = true;
          }).on('end', () => {
            fs.unlink(tempFile);
            fs.unlink(tempFileAudio);
            fs.rename(outputFile, filePath);
            logger.log('transcoding finished');
          }).save(outputFile);
        } else {
          fs.rename(tempFile, filePath);
        }

        if (command) {
          socket.on('disconnect', () => {
            logger.warn('client disconnected, killing ffmpeg');
            command.kill('SIGKILL');
            [filePath, tempFile, tempFileAudio].forEach((file) => {
              if (fs.existsSync(file)) {
                fs.unlink(file);
              }
            });
          });
        }
      });
    });
  });

  app.get('/api/download_file/:id', (req, res) => {
    let id = req.params.id;
    let path = `${FILE_DIR}/${id}.${FINAL_EXT}`;
    if (fs.existsSync(path) && files[id]) {
      let fileName = files[id].name;
      let file = fs.createReadStream(path);
      let stat = fs.statSync(path);
      logger.log('providing file to browser for download', fileName);
      res.setHeader('Content-Length', stat.size);
      res.setHeader('Content-Type', mime.lookup(fileName));
      res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
      file.pipe(res);
    } else {
      res.sendStatus(404);
    }
  });

  let forceAuth = (req, res, callback) => {
    let credentials = auth(req);
    if (ADMIN_USERNAME && ADMIN_PASSWORD && credentials && credentials.name === ADMIN_USERNAME && credentials.pass === ADMIN_PASSWORD) {
      callback();
    } else {
      res.setHeader('WWW-Authenticate', 'Basic realm="Admin area"');
      res.sendStatus(401);
    }
  };

  app.get('/api/admin', (req, res) => {
    forceAuth(req, res, () => {
      res.render('pages/admin');
    });
  });

  app.get('/api/admin/info', (req, res) => {
    forceAuth(req, res, () => {
      os.cpuUsage((cpuUsage) => {
        fs.readdir('logs', (err, logs) => {
          logs = logs.filter((log) => log.endsWith('.log')).map((log) => log.slice(0, -4));
          res.json({
            environment,
            usage: {
              cpu: cpuUsage,
              memory: 1 - os.freememPercentage()
            },
            files,
            logs
          });
        });
      });
    });
  });

  app.get('/api/admin/view_log/:log', (req, res) => {
    forceAuth(req, res, () => {
      let log = `logs/${req.params.log}.log`;
      if (fs.existsSync(log)) {
        fs.readFile(log, {
          encoding: 'utf-8'
        }, (err, data) => {
          res.send(data.split('\n').join('<br>'));
        });
      } else {
        res.sendStatus(404);
      }
    });
  });

  app.get('/api/admin/download_log/:log', (req, res) => {
    forceAuth(req, res, () => {
      let log = `${req.params.log}.log`;
      let path = `logs/${log}`;
      if (fs.existsSync(path)) {
        let file = fs.createReadStream(path);
        let stat = fs.statSync(path);
        logger.log('providing log to browser for download', log);
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Content-Disposition', `attachment; filename=${log}`);
        file.pipe(res);
      } else {
        res.sendStatus(404);
      }
    });
  });

  app.post('/api/admin/reboot', (req, res) => {
    forceAuth(req, res, () => {
      if (ON_HEROKU) {
        // Can't provide a response, since we're killing the process
        heroku.delete(`/apps/${HEROKU_APP_NAME}/dynos`);
      }
    });
  });

  setInterval(() => {
    logger.log('deleting unused files');
    fs.readdir(FILE_DIR, (err, files) => {
      for (const file of files) {
        let createdAt = new Date(fs.statSync(`${FILE_DIR}/${file}`).mtime).getTime();
        if (file.endsWith('.complete') && Date.now() - createdAt >= 3600000) {
          fs.unlink(`${FILE_DIR}/${file}`);
        }
      }
    });
  }, FILE_DELETION_INTERVAL);
})();
