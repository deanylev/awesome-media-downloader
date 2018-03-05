const express = require('express');
const bodyParser = require('body-parser');
const youtubedl = require('youtube-dl');
const request = require('request');
const fs = require('fs');
const path = require('path');

const port = process.env.PORT || 8080;
const app = express();

app.listen(port);
console.log('started server on port', port)
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

  video.on('info', (info) => {
    fileName = info._filename;
    filePath = `videos/${fileName}`;
    console.log('downloading video', fileName);
    res.send({
      fileName,
      fileSize: info.size,
      tempFile
    });
  });

  video.on('error', (err) => {
    console.log('error while downloading video', err);
    fs.unlink(tempFile);
    res.sendStatus(500);
  });

  video.pipe(fs.createWriteStream(tempFile));

  video.on('end', () => {
    console.log('video finished downloading', fileName)
    fs.rename(tempFile, filePath);
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
  let actualSize = totalSize;
  let status;

  if (fs.existsSync(tempFile)) {
    actualSize = fs.statSync(tempFile).size;
    status = 'downloading';
  } else {
    status = 'complete';
  }

  res.send({
    status,
    progress: actualSize / totalSize
  });
});

setInterval(() => {
  console.log('deleting unused videos');
  fs.readdir('videos', (err, files) => {
    for (const file of files) {
      if (!(file.endsWith('.tmp') && file === '.gitkeep')) {
        fs.unlink(`videos/${file}`);
      }
    }
  });
}, 3600000);
