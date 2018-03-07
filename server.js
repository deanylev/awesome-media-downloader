const express = require('express');
const bodyParser = require('body-parser');
const youtubedl = require('youtube-dl');
const request = require('request');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');

const port = process.env.PORT || 8080;
const app = express();

app.listen(port);
console.log('started server on port', port)
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(bodyParser.urlencoded({
  extended: true
}));

(() => {
  let transcodingProgress;

  app.get('/', (req, res) => {
    res.render('pages/index');
  });

  app.post('/download', (req, res) => {
    let video = youtubedl(req.body.url);
    let tempFile = `videos/${Math.random().toString(36).substring(2)}.tmp`;
    let fileName;
    let filePath;
    let format = req.body.format;

    video.on('info', (info) => {
      fileName = info._filename;
      if (format) {
        if (info.ext === format) {
          format = '';
        } else {
          fileName = fileName.slice(0, -(info.ext.length + 1));
          fileName += `.${format}`;
        }
      }
      filePath = `videos/${fileName}`;
      console.log('downloading video', fileName);
      res.json({
        fileName,
        fileSize: info.size,
        tempFile,
        format
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
          case 'mp3':
            ffmpeg(tempFile).noVideo().audioBitrate('192k').audioChannels(2).audioCodec('libmp3lame').on('progress', (progress) => {
              transcodingProgress = progress.percent / 100;
            }).on('end', () => {
              fs.unlink(tempFile);
              console.log('transcoding finished');
            }).save(filePath);
            break;
          case 'mp4':
            ffmpeg(tempFile).videoCodec('libx264').on('progress', (progress) => {
              transcodingProgress = progress.percent / 100;
            }).on('end', () => {
              fs.unlink(tempFile);
              console.log('transcoding finished');
            }).save(filePath);
        }
      } else {
        fs.rename(tempFile, filePath);
      }
    });
  });

  app.get('/download_file', (req, res) => {
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

  app.get('/download_status', (req, res) => {
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

    res.json({
      status,
      progress
    });
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
}, 3600000);

setInterval(() => {
  console.log('deleting tmp files');
  fs.readdir('videos', (err, files) => {
    for (const file of files) {
      if (file.endsWith('.tmp')) {
        fs.unlink(`videos/${file}`);
      }
    }
  });
}, 86400000);
