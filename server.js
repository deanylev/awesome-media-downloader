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
const moment = require('moment');
const md5 = require('md5');
const globals = require('./globals');

const Heroku = require('heroku-client');
const Logger = require('./logger');
const Database = require('./database');
const BackgroundTasks = require('./background-tasks');

const PORT = process.env.PORT || 8080;
const ENV = process.env.ENV || 'production';
const STATUS_INTERVAL = process.env.STATUS_INTERVAL || 1000;
const ALLOW_FORMAT_SELECTION = !!process.env.ALLOW_FORMAT_SELECTION;
const ALLOW_QUALITY_SELECTION = !!process.env.ALLOW_QUALITY_SELECTION;
const ALLOW_REQUESTED_NAME = !!process.env.ALLOW_REQUESTED_NAME;
const {
  ADMIN_USERNAME,
  ADMIN_PASSWORD,
  HEROKU_APP_NAME
} = process.env;

const VIDEO_FORMATS = ['mp4', 'mkv'];
const AUDIO_FORMATS = ['mp3', 'wav', 'webm'];

const FILE_DIR = globals.FileDir;
const TMP_EXT = globals.TmpExt;
const FINAL_EXT = globals.FinalExt;
const MESSAGES = Logger.Messages;

const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const logger = new Logger(ENV, io);
const db = new Database();
const backgroundTasks = new BackgroundTasks();
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
    console.error(`port ${PORT} is in use. ${process.env.PORT ? '' : `kill whatever is running on port ${PORT} or set the PORT env variable to something different.`}`);
  } else {
    logger.error('an error occured', err);
  }
  process.exit();
});

http.listen(PORT, () => {
  logger.log('started server on port', PORT);
});

{
  let environment;
  let files = {};

  commandExists('ffmpeg', (err, commandExists) => {
    environment = {
      environment: ENV,
      ffmpeg: commandExists,
      onHeroku: !!HEROKU_APP_NAME,
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

  io.of('/user').on('connection', (socket) => {
    let ipAddress = socket.client.request.headers['cf-connecting-ip'] || socket.request.connection.remoteAddress;
    let clientId = socket.id;
    logger.log('client connected', {
      clientId,
      ipAddress
    });

    socket.on('disconnect', () => {
      logger.log('client disconnected', {
        clientId,
        ipAddress
      });
    });

    let id;
    let transcodingProgress = 0;
    let transcodingError;

    socket.on('environment check', () => {
      socket.emit('environment details', environment);
    });

    if (ALLOW_REQUESTED_NAME) {
      socket.on('file title', (url, index) => {
        youtubedl.getInfo(url, (err, info) => {
          let title = err ? 'Not a valid URL' : info.title;
          socket.emit('file title', title, index);
        });
      });
    }

    socket.on('download file', (url, requestedFormat, requestedQuality, requestedName) => {
      id = uuidv4();
      logger.log('received download request', {
        id,
        url,
        requestedFormat,
        requestedQuality,
        requestedName
      });
      requestedFormat = requestedFormat === 'none' ? '' : requestedFormat;
      requestedQuality = requestedQuality === 'none' ? '' : requestedQuality;
      let format = environment.ffmpeg && ALLOW_FORMAT_SELECTION ? requestedFormat : '';
      let tempFile = `files/${id}.${TMP_EXT}`;
      let tempFileAudio;
      let options = [];
      if (requestedQuality === 'best' && ALLOW_QUALITY_SELECTION) {
        options.push('-f', 'bestvideo[ext=mp4]/bestvideo');
        let audio = youtubedl(url, ['-f', 'bestaudio']);
        tempFileAudio = `${tempFile}audio`;
        audio.pipe(fs.createWriteStream(tempFileAudio));

        audio.on('info', (info) => {
          logger.log('downloading audio track', {
            fileId: id,
            format: info.ext
          });
        });

        audio.on('end', () => {
          logger.log('audio track finished downloading', id);
        });
      } else if (format && AUDIO_FORMATS.includes(format)) {
        logger.log('requested format is audio, requesting audio only');
        options.push('-f', `bestaudio[ext=${format}]/bestaudio[ext=m4a]/bestaudio/best`);
      }
      let file = youtubedl(url, options, {
        cwd: __dirname,
        maxBuffer: Infinity
      });
      let fileName;
      let filePath;
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
        if (format && format !== info.ext && (VIDEO_FORMATS.includes(format) || AUDIO_FORMATS.includes(format))) {
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
        logger.log('downloading file', {
          id,
          url,
          fileName,
          requestedFormat,
          requestedQuality
        });
        socket.emit('file details', {
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
        logger.error('error while downloading file', {
          id,
          err: err.toString()
        });
        fs.unlink(tempFile);
        socket.emit('download error');
      });

      file.pipe(fs.createWriteStream(tempFile));

      file.on('end', () => {
        socket.removeListener('disconnect', cancelDownload);
        logger.log('file finished downloading', fileName);
        db.query('INSERT INTO downloads SET ?', {
          id,
          datetime: db.now(),
          clientId,
          url,
          name: fileName
        });
        let command;
        let outputFile = `files/${id}.transcoding.${format || originalFormat}`;
        let handleTranscodingError = (err) => {
          err = err.toString();
          // XXX string matching isn't great, but no way to avoid the error
          if (err !== 'Error: ffmpeg was killed with signal SIGKILL') {
            logger.error('error when transcoding', err);
            transcodingError = true;
          }
        };
        let handleTranscodingProgress = (progress) => {
          transcodingProgress = progress.percent / 100;
        };
        if (format) {
          logger.log('transcoding to', format);
          let finishConversion = () => {
            fs.unlink(tempFile);
            fs.rename(outputFile, filePath);
            logger.log('transcoding finished');
          };
          switch (format) {
            case 'mp4':
            case 'mkv':
              command = ffmpeg(tempFile)
                .videoCodec('libx264')
                .on('progress', handleTranscodingProgress)
                .on('error', handleTranscodingError)
                .on('end', finishConversion)
                .save(outputFile);
              break;
            case 'mp3':
              command = ffmpeg(tempFile)
                .noVideo()
                .audioBitrate('192k')
                .audioChannels(2)
                .audioCodec('libmp3lame')
                .on('progress', handleTranscodingProgress)
                .on('error', handleTranscodingError)
                .on('end', finishConversion)
                .save(outputFile);
              break;
            case 'wav':
              command = ffmpeg(tempFile)
                .noVideo()
                .audioFrequency(44100)
                .audioChannels(2)
                .audioCodec('pcm_s16le')
                .on('progress', handleTranscodingProgress)
                .on('error', handleTranscodingError)
                .on('end', finishConversion)
                .save(outputFile);
              break;
            case 'webm':
              command = ffmpeg(tempFile)
                .noVideo()
                .audioChannels(2)
                .audioCodec('libvorbis')
                .on('progress', handleTranscodingProgress)
                .on('error', handleTranscodingError)
                .on('end', finishConversion)
                .save(outputFile);
              break;
            default:
              transcodingError = true;
          }
        } else if (requestedQuality === 'best' && ALLOW_QUALITY_SELECTION) {
          logger.log('combining video and audio files');
          let finishCombining = () => {
            fs.unlink(tempFile);
            fs.unlink(tempFileAudio);
            fs.rename(outputFile, filePath);
            logger.log('transcoding finished');
          };
          command = ffmpeg()
            .videoCodec('copy')
            .input(tempFile)
            .input(tempFileAudio)
            .on('progress', handleTranscodingProgress)
            .on('error', handleTranscodingError)
            .on('end', finishCombining)
            .save(outputFile);
        } else {
          fs.rename(tempFile, filePath);
        }

        let killTranscoder = () => {
          logger.warn('client disconnected, killing ffmpeg');
          command.kill('SIGKILL');
          [filePath, tempFile, tempFileAudio].forEach((file) => {
            if (fs.existsSync(file)) {
              fs.unlink(file);
            }
          });
        };

        if (command) {
          socket.once('disconnect', killTranscoder);
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

  let forceAuth = (method, url, callback, log) => {
    app[method](url, (req, res) => {
      let ipAddress = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
      let credentials = auth(req);
      if (ADMIN_USERNAME && ADMIN_PASSWORD && credentials && credentials.name === ADMIN_USERNAME && credentials.pass === ADMIN_PASSWORD) {
        if (log) {
          logger.log('successful admin login', {
            ipAddress,
            user: credentials.name
          });
        }
        callback(req, res);
      } else {
        res.setHeader('WWW-Authenticate', 'Basic realm="Admin area"');
        res.sendStatus(401);
        logger.warn('admin login attempt', {
          ipAddress,
          user: credentials ? credentials.name : ''
        });
      }
    });
  };

  forceAuth('get', '/api/admin', (req, res) => {
    res.render('pages/admin', {
      username: ADMIN_USERNAME,
      password: ADMIN_PASSWORD
    });
  }, true);

  forceAuth('get', '/api/admin/download/db/:id', (req, res) => {
    let id = req.params.id;
    let path = `bak/db/${id}`;
    if (fs.existsSync(path)) {
      let file = fs.createReadStream(path);
      let stat = fs.statSync(path);
      logger.log('providing db to browser for download', id);
      res.setHeader('Content-Length', stat.size);
      res.setHeader('Content-Type', mime.lookup('sql'));
      res.setHeader('Content-Disposition', `attachment; filename=db_${id}.sql`);
      file.pipe(res);
    } else {
      res.sendStatus(404);
    }
  });

  io.of('/admin').on('connection', (socket) => {
    logger.log('client connected to admin socket', socket.id);
    fs.readFile('views/pages/admin.ejs', (err, buffer) => {
      socket.emit('page hash', md5(buffer));
    });
    socket.on('credentials', (username, password) => {
      if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        setInterval(() => {
          let getCpuUsage = new Promise((resolve, reject) => {
            os.cpuUsage(resolve);
          });
          let getLogs = new Promise((resolve, reject) => {
            db.query('SELECT * FROM logs ORDER BY datetime DESC').then((logs) => {
              logs.forEach((log, index) => {
                logs[index].datetime = moment(log.datetime).format('MMMM Do YYYY, h:mm:ss a');
                logs[index].message = MESSAGES[log.level][log.message] || 'unknown message';
              });
              resolve(logs);
            });
          });
          let getDownloads = new Promise((resolve, reject) => {
            db.query('SELECT * FROM downloads ORDER BY datetime DESC').then((downloads) => {
              downloads.forEach((download, index) => {
                downloads[index].datetime = moment(downloads[index].datetime).format('MMMM Do YYYY, h:mm:ss a');
                downloads[index].exists = fs.existsSync(`${FILE_DIR}/${downloads[index].id}.${FINAL_EXT}`) && files[downloads[index].id];
              });
              resolve(downloads);
            });
          });
          let getDbs = new Promise((resolve, reject) => {
            fs.readdir('bak/db', (err, dbs) => {
              dbs = dbs.filter((db) => db !== '.gitkeep').map((db) => ({
                datetime: moment(parseInt(db)).format('MMMM Do YYYY, h:mm:ss a'),
                id: db
              }));
              resolve(dbs);
            });
          });
          Promise.all([getCpuUsage, getLogs, getDownloads, getDbs]).then((values) => {
            socket.emit('info', {
              environment,
              usage: {
                cpu: values[0],
                memory: 1 - os.freememPercentage()
              },
              logs: values[1],
              downloads: values[2],
              dbs: values[3]
            });
          });
        }, 1000);

        socket.on('delete', (table, id) => {
          if (id) {
            db.query(`DELETE FROM ${table} WHERE id = '${id}'`);
          } else {
            db.query(`DROP TABLE ${table}`);
          }
          db.createDefaults();
          socket.emit('delete success');
        });

        socket.on('reboot', () => {
          socket.emit('reboot success');
          if (HEROKU_APP_NAME) {
            // Can't provide a response, since we're killing the process
            heroku.delete(`/apps/${HEROKU_APP_NAME}/dynos`);
          }
        });

        socket.on('db dump', () => {
          backgroundTasks.dbDump();
          socket.emit('db dump success');
        });

        socket.on('db dump delete', (id) => {
          if (id) {
            fs.unlink(`bak/db/${id}`);
            logger.log('deleted db dump', id);
          } else {
            fs.readdir('bak/db', (err, files) => {
              for (const file of files) {
                if (file !== '.gitkeep') {
                  fs.unlink(`bak/db/${file}`);
                }
              }
            });
            socket.emit('db dump success');
            logger.log('deleted all db dumps');
          }
        });

        socket.on('set config var', (key, value) => {
          let allowedKeys = [
            'ALLOW_FORMAT_SELECTION',
            'ALLOW_QUALITY_SELECTION',
            'ALLOW_REQUESTED_NAME'
          ];
          if (allowedKeys.includes(key)) {
            let body = {};
            body[key] = value;
            heroku.patch(`/apps/${HEROKU_APP_NAME}/config-vars`, {
              body
            }).then(() => {
              logger.log('set config var', {
                key,
                value
              });
            });
          }
        });
      } else {
        socket.disconnect();
      }
    });
  });
}
