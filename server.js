// node libraries
const fs = require('fs');

// our libraries
const db = require('./database');
const taskManager = require('./task-manager');
const heroku = require('./heroku');

// third party libraries
const express = require('express');
const bodyParser = require('body-parser');
const youtubedl = require('youtube-dl');
const uuidv4 = require('uuid/v4');
const mime = require('mime-types');
const os = require('os-utils');
const moment = require('moment');
const md5 = require('md5');
const Raven = require('raven');
const emojiStrip = require('emoji-strip');

// globals
const DOWNLOADS = {};
const {
  PORT,
  ENV,
  ENVIRONMENT,
  ALLOW_FORMAT_SELECTION,
  ALLOW_QUALITY_SELECTION,
  ADMIN_USERNAME,
  ADMIN_PASSWORD,
  PROXY_HOST,
  SENTRY_URL,
  FILE_DIR,
  TMP_EXT,
  FINAL_EXT,
  FORMAT_ALIASES,
  FORMAT_GROUPS,
  LOGGER_MESSAGES,
  ADMIN_SOCKET_KEY
} = require('./globals');

// config
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

const Logger = require('./logger');
const logger = new Logger('server');
const SecurityManager = require('./security-manager');
const securityManager = new SecurityManager(app);
const Transcoder = require('./transcoder');

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
    logger.error('port in use');
  } else {
    logger.error('an error occured', err);
  }

  process.exit();
});

if (SENTRY_URL) {
  Raven.config(SENTRY_URL).install();
}

// actual logic

http.listen(PORT, () => {
  logger.log('started server on port', PORT);

  if (PROXY_HOST) {
    logger.log('using proxy host', PROXY_HOST);
  }
});

app.get('/', (req, res) => {
  res.render('pages/index');
});

io.of('/user').on('connection', (socket) => {
  const client = {
    id: socket.id,
    ip: socket.client.request.headers['cf-connecting-ip'] || socket.request.connection.remoteAddress
  };

  logger.log('client connected', client);

  socket.on('disconnect', () => logger.log('client disconnected', client.id));
  socket.on('get environment', (callback) => callback(true, ENVIRONMENT));
  socket.on('download file', (url, requestedFormat, requestedQuality, callback) => {
    logger.log('received download request', {
      url,
      requestedFormat,
      requestedQuality,
    });

    let transcoder, killTranscoder, transcodingError, downloadCancelled, downloadComplete;
    const options = [];
    const id = uuidv4();
    const file = {
      id,
      transcode: false,
      format: requestedFormat !== 'none' && ALLOW_FORMAT_SELECTION ? requestedFormat : null,
      quality: requestedQuality !== 'none' && ALLOW_QUALITY_SELECTION ? requestedQuality : null,
      originalFormat: null,
      title: null,
      size: null,
      fileName: null,
      path: null,
      tempPath: `${FILE_DIR}/${id}.${TMP_EXT}`
    };

    if (PROXY_HOST) {
      options.push(`--proxy=${PROXY_HOST}`);
    }

    if (file.quality === 'best') {
      file.transcode = true;
      options.push('-f', 'bestvideo[ext=mp4]/bestvideo');

      const audioOptions = ['-f', 'bestaudio'];
      if (PROXY_HOST) {
        audioOptions.push(`--proxy=${PROXY_HOST}`);
      }

      const audioDownload = youtubedl(url, audioOptions);
      file.audioPath = `${file.tempPath}audio`;

      audioDownload.on('info', (info) => {
        logger.log('downloading audio track', {
          id,
          format: info.ext
        });
      });

      audioDownload.on('end', () => logger.log('audio track finished downloading', id));
      audioDownload.pipe(fs.createWriteStream(file.audioPath));
    }

    const download = youtubedl(url, options, {
      cwd: __dirname,
      maxBuffer: Infinity
    });

    const cancelDownload = () => {
      logger.warn('cancelling download');
      download.pause();
      download.unpipe();
    };

    download.on('info', (info) => {
      socket.on('disconnect', cancelDownload);

      file.title = file.fileName = emojiStrip(info.title);
      file.size = info.size;

      const format = FORMAT_ALIASES[file.format] || file.format;
      const ext = file.originalFormat = info.ext;
      let fileExt;
      if (format && format !== ext) {
        if (format === 'audio') {
          file.transcode = true;
          fileExt = ext;
        } else {
          file.transcode = !(FORMAT_GROUPS.h264.includes(ext) && FORMAT_GROUPS.h264.includes(format));
          fileExt = format;
        }
      } else {
        fileExt = ext;
      }

      file.fileName += `.${fileExt}`;

      DOWNLOADS[id] = {
        title: file.title,
        fileExt
      };

      file.path = `${FILE_DIR}/${id}.${FINAL_EXT}`;

      logger.log('downloading file', {
        id,
        url,
        fileName: file.fileName,
        format: file.format || 'original',
        quality: file.quality || 'standard'
      });

      callback(true, {
        id,
        title: file.title
      });

      const inputs = [file.tempPath];
      if (file.audioPath) {
        inputs.push(file.audioPath);
      }

      transcoder = new Transcoder(id, inputs, file.format || file.originalFormat);
      killTranscoder = () => transcoder.kill();

      const checkStatus = setInterval(() => {
        let currentSize, status;
        const {
          size,
          tempPath
        } = file;

        if (downloadComplete) {
          status = 'complete';
          clearInterval(checkStatus);
          socket.removeListener('disconnect', killTranscoder);
        } else {
          currentSize = fs.statSync(tempPath).size;
          if (currentSize === size) {
            status = 'transcoding';
          } else {
            status = 'downloading';
          }
        }

        const progress = Math.max(0, Math.min(status === 'transcoding' ? transcoder.getProgress() : currentSize / size, 1));
        if (downloadCancelled) {
          socket.emit('download cancelled');
          clearInterval(checkStatus);
          status === 'transcoding' ? transcoder.kill() : cancelDownload();
        } else if (transcodingError) {
          socket.emit('transcoding error');
          clearInterval(checkStatus);
        } else {
          socket.emit('download progress', {
            progress,
            status
          });
        }
      }, 1000);
    });

    download.on('error', (err) => {
      logger.error('error while downloading file', {
        id,
        err: err.toString()
      });
      callback(false);
    });

    download.on('end', () => {
      socket.removeListener('disconnect', cancelDownload);
      logger.log('file finished downloading', {
        id,
        title: file.title
      });
      db.query('INSERT INTO downloads SET ?', {
        id,
        datetime: db.now(),
        clientId: client.id,
        url,
        name: file.fileName
      });

      const handleTranscodingError = () => transcodingError = true;

      if (file.transcode) {
        if (file.quality === 'best') {
          transcoder.combine()
            .then((output) => {
              fs.rename(output, file.path);
              downloadComplete = true;
            });
        } else {
          if (file.format === 'audio') {
            transcoder.getAudioFormat()
              .catch(handleTranscodingError)
              .then((format) => {
                DOWNLOADS[id].fileExt = format;
                transcoder.setFormat(format);
                return transcoder.extractAudio();
              })
              .then((output) => {
                fs.rename(output, file.path);
                downloadComplete = true;
              })
              .catch(handleTranscodingError);
          } else {
            transcoder.convert()
              .then((output) => {
                fs.rename(output, file.path);
                downloadComplete = true;
              })
              .catch(handleTranscodingError);
          }
        }

        socket.on('disconnect', killTranscoder);
      } else {
        fs.rename(file.tempPath, file.path);
        downloadComplete = true;
      }
    });

    download.pipe(fs.createWriteStream(file.tempPath));

    socket.once('cancel download', () => downloadCancelled = true);
  });
});

app.get('/api/download/:id', (req, res) => {
  const { id } = req.params;
  const path = `${FILE_DIR}/${id}.${FINAL_EXT}`;
  const download = DOWNLOADS[id];
  if (fs.existsSync(path) && download) {
    const name = `${download.title}.${download.fileExt}`;
    const file = fs.createReadStream(path);
    const stat = fs.statSync(path);
    logger.log('providing file download', name);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Type', mime.lookup(name));
    res.setHeader('Content-Disposition', `attachment; filename=${name}`);
    file.pipe(res);
  } else {
    res.sendStatus(404);
  }
});

securityManager.basicAuth('get', '/api/admin', (req, res) => {
  res.render('pages/admin');
}, true);

securityManager.basicAuth('get', '/api/admin/creds', (req, res) => {
  res.json({
    username: SecurityManager.encryptString(ADMIN_USERNAME, ADMIN_SOCKET_KEY),
    password: SecurityManager.encryptString(ADMIN_PASSWORD, ADMIN_SOCKET_KEY)
  });
});

io.of('/admin').on('connection', (socket) => {
  logger.log('client connected to admin socket', socket.id);
  fs.readFile('views/pages/admin.ejs', (err, buffer) => {
    socket.emit('page hash', md5(buffer));
  });

  socket.on('credentials', (username, password) => {
    if (SecurityManager.decryptString(username, ADMIN_SOCKET_KEY) === ADMIN_USERNAME && SecurityManager.decryptString(password, ADMIN_SOCKET_KEY) === ADMIN_PASSWORD) {
      setInterval(() => {
        const getCpuUsage = new Promise((resolve, reject) => {
          os.cpuUsage(resolve);
        });
        const getLogs = new Promise((resolve, reject) => {
          db.query('SELECT * FROM logs ORDER BY datetime DESC').then((logs) => {
            logs.forEach((log, index) => {
              log.datetime = moment(log.datetime).format('MMMM Do YYYY, h:mm:ss a');
              log.message = LOGGER_MESSAGES[log.level][log.message] || 'unknown message';
            });
            resolve(logs);
          });
        });
        const getDownloads = new Promise((resolve, reject) => {
          db.query('SELECT * FROM downloads ORDER BY datetime DESC').then((downloads) => {
            downloads.forEach((download, index) => {
              download.datetime = moment(download.datetime).format('MMMM Do YYYY, h:mm:ss a');
              download.exists = fs.existsSync(`${FILE_DIR}/${download.id}.${FINAL_EXT}`) && DOWNLOADS[download.id];
            });
            resolve(downloads);
          });
        });
        const getDbs = new Promise((resolve, reject) => {
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
            environment: ENVIRONMENT,
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
        heroku.setConfigVar(key, value).then(() => {
          logger.log('set config var', {
            key,
            value
          });
        }).catch((err) => {
          logger.error('error while setting config var', err);
        });
      });
    } else {
      socket.disconnect();
    }
  });
});

securityManager.basicAuth('get', '/api/admin/download/db/:id', (req, res) => {
  const { id } = req.params;
  const path = `bak/db/${id}`;
  if (fs.existsSync(path)) {
    const file = fs.createReadStream(path);
    const stat = fs.statSync(path);
    logger.log('providing db download', id);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Type', mime.lookup('sql'));
    res.setHeader('Content-Disposition', `attachment; filename=db_${id}.sql`);
    file.pipe(res);
  } else {
    res.sendStatus(404);
  }
});
