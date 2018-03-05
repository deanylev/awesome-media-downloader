const express = require('express');
const bodyParser = require('body-parser');
const youtubedl = require('youtube-dl');
const request = require('request');
const fs = require('fs');
const path = require('path');

const port = 8080;
const app = express();

app.listen(port);
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({
  extended: true
}));

app.get('/', (req, res) => {
  res.render('pages/index');
});

app.post('/download', (req, res) => {
  let video = youtubedl(req.body.url);
  let tempFile = `videos/${Math.random().toString(36).substring(2)}.tmp`;
  let fileName;
  let filePath;

  video.on('info', function(info) {
    fileName = info._filename;
    filePath = `videos/${fileName}`;
    res.send({
      fileName,
      fileSize: info.size
    });
  });

  video.on('error', function error(err) {
    fs.unlink(tempFile);
    res.sendStatus(500);
  });

  video.pipe(fs.createWriteStream(tempFile));

  video.on('end', (info) => {
    fs.rename(tempFile, filePath);
  });
});

app.get('/download_file', (req, res) => {
  let video = decodeURIComponent(req.query.video);
  let path = `videos/${video}`;
  let file = fs.createReadStream(path);
  let stat = fs.statSync(path);
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Content-Type', 'video/webm');
  res.setHeader('Content-Disposition', `attachment; filename=${video}`);
  file.pipe(res);
});

app.get('/download_status', (req, res) => {
  let totalSize = req.query.fileSize;
  let actualSize = fs.statSync(`videos/${decodeURIComponent(req.query.fileName)}`).size;
  let status = actualSize === parseInt(totalSize) ? 'complete' : 'downloading';

  res.send({
    status,
    progress: actualSize / totalSize
  });
});
