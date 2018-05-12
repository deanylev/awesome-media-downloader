const express = require('express');
const bodyParser = require('body-parser');
const youtubedl = require('youtube-dl');
const fs = require('fs');
const commandExists = require('command-exists');
const uuidv4 = require('uuid/v4');
const mime = require('mime-types');
const os = require('os-utils');
const moment = require('moment');
const md5 = require('md5');
const db = require('./database');
const taskManager = require('./task-manager');
const heroku = require('./heroku');
const Raven = require('raven');
const Logger = require('./logger');
const Transcoder = require('./transcoder');
const Protector = require('./protector');

const { MESSAGES } = Logger;
const {
  PORT,
  ENV,
  ALLOW_FORMAT_SELECTION,
  ALLOW_QUALITY_SELECTION,
  ALLOW_REQUESTED_NAME,
  ADMIN_USERNAME,
  ADMIN_PASSWORD,
  HEROKU_APP_NAME,
  PROXY_HOST,
  SENTRY_URL,
  FILE_DIR,
  TMP_EXT,
  FINAL_EXT,
  VIDEO_FORMATS,
  AUDIO_FORMATS,
  FORMAT_ALIASES
} = require('./globals');

const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const logger = new Logger('server');
const protector = new Protector(app);

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

  if (PROXY_HOST) {
    logger.log('using proxy host', PROXY_HOST);
  }
});

if (SENTRY_URL) {
  Raven.config(SENTRY_URL).install();
}

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
    let transcodingError = false;

    socket.on('environment check', () => {
      socket.emit('environment details', environment);
    });

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
      let transcoder;
      let format = environment.ffmpeg && ALLOW_FORMAT_SELECTION ? requestedFormat : '';
      let tempFile = `${FILE_DIR}/${id}.${TMP_EXT}`;
      let tempFileAudio;
      let options = [];
      if (requestedQuality === 'best' && ALLOW_QUALITY_SELECTION) {
        options.push('-f', 'bestvideo[ext=mp4]/bestvideo');
        let audioOptions = ['-f', 'bestaudio'];
        if (PROXY_HOST) {
          audioOptions.push(`--proxy=${PROXY_HOST}`);
        }
        let audio = youtubedl(url, audioOptions);
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
      }

      if (PROXY_HOST) {
        options.push(`--proxy=${PROXY_HOST}`);
      }

      let file = youtubedl(url, options, {
        cwd: __dirname,
        maxBuffer: Infinity
      });
      let fileName;
      let fileTitle;
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
        fileTitle = info.title;
        fileName = requestedName && ALLOW_REQUESTED_NAME ? `${requestedName}.` : `${info.title}.`;
        if (format && format !== info.ext && FORMAT_ALIASES[format] !== info.ext && (VIDEO_FORMATS.includes(format) || AUDIO_FORMATS.includes(format))) {
          fileName += FORMAT_ALIASES[format] || format;
          if (x264Formats.includes(info.ext) && x264Formats.includes(format)) {
            format = '';
          }
        } else {
          fileName += info.ext;

          if (format !== 'audio') {
            format = '';
          }
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
          requestedQuality,
          actualFormat: info.ext
        });
        socket.emit('file details', {
          fileTitle,
          id
        });

        let inputs = [tempFile];
        if (tempFileAudio) {
          inputs.push(tempFileAudio);
        }

        transcoder = new Transcoder(id, inputs, format || originalFormat);

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

          let progress = status === 'transcoding' ? transcoder.getProgress() : actualSize / totalSize;
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
        }, 1000);
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
        let handleTranscodingError = (err) => {
          // XXX string matching isn't great, but no way to avoid the error
          if (err !== 'ffmpeg was killed with signal SIGKILL') {
            transcodingError = true;
          }
        };
        if (format) {
          if (format === 'audio') {
            transcoder.getAudioFormat().then((audioFormat) => {
              files[id].name = `${fileName.slice(0, -(originalFormat.length))}${audioFormat}`;
              transcoder.setFormat(audioFormat);
              return transcoder.extractAudio();
            }).then((outputFile) => {
              fs.unlink(tempFile);
              fs.rename(outputFile, filePath);
            }).catch(handleTranscodingError);
          } else {
            transcoder.convert().then((outputFile) => {
              fs.unlink(tempFile);
              fs.rename(outputFile, filePath);
            }).catch(handleTranscodingError);
          }
        } else if (requestedQuality === 'best' && ALLOW_QUALITY_SELECTION) {
          transcoder.combine().then((outputFile) => {
            fs.unlink(tempFile);
            fs.unlink(tempFileAudio);
            fs.rename(outputFile, filePath);
          }).catch(handleTranscodingError);
        } else {
          fs.rename(tempFile, filePath);
        }

        socket.once('disconnect', () => {
          transcoder.kill();
          [filePath, tempFile, tempFileAudio].forEach((file) => {
            if (fs.existsSync(file)) {
              fs.unlink(file);
            }
          });
        });
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

  protector.basicAuth('get', '/api/admin', (req, res) => {
    let key = uuidv4();

    res.render('pages/admin', {
      username: protector.encryptString(ADMIN_USERNAME, key),
      password: protector.encryptString(ADMIN_PASSWORD, key)
    });

    io.of('/admin').once('connection', (socket) => {
      logger.log('client connected to admin socket', socket.id);
      fs.readFile('views/pages/admin.ejs', (err, buffer) => {
        socket.emit('page hash', md5(buffer));
      });

      socket.on('credentials', (username, password) => {
        if (protector.decryptString(username, key) === ADMIN_USERNAME && protector.decryptString(password, key) === ADMIN_PASSWORD) {
          setInterval(() => {
            let getCpuUsage = new Promise((resolve, reject) => {
              os.cpuUsage(resolve);
            });
            let getLogs = new Promise((resolve, reject) => {
              db.query('SELECT * FROM logs ORDER BY datetime DESC').then((logs) => {
                logs.forEach((log, index) => {
                  log.datetime = moment(log.datetime).format('MMMM Do YYYY, h:mm:ss a');
                  log.message = MESSAGES[log.level][log.message] || 'unknown message';
                });
                resolve(logs);
              });
            });
            let getDownloads = new Promise((resolve, reject) => {
              db.query('SELECT * FROM downloads ORDER BY datetime DESC').then((downloads) => {
                downloads.forEach((download, index) => {
                  download.datetime = moment(download.datetime).format('MMMM Do YYYY, h:mm:ss a');
                  download.exists = fs.existsSync(`${FILE_DIR}/${download.id}.${FINAL_EXT}`) && files[download.id];
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
            heroku.restartDynos();
          });

          socket.on('db dump', () => {
            db.dump();
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
              heroku.setConfigVar(key, value).then(() => {
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
  }, true);

  protector.basicAuth('get', '/api/admin/download/db/:id', (req, res) => {
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
}
