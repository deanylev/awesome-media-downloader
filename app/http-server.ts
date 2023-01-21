// node libraries
import { exec } from 'child_process';
import fs from 'fs';
import { AddressInfo } from 'net';
import { parse } from 'path';
import { Readable } from 'stream';
import { promisify } from 'util';

// our libraries
import { httpPort } from './config';
import { DOWNLOAD_DIR } from './constants';
import { CancelReason, VideoStatus } from './enums';
import Logger from './logger';

// third party libraries
import express from 'express';
import { after } from 'lodash';
import { getType } from 'mime';
import removeAccents from 'remove-accents';
import { v4 } from 'uuid';
import youtubedl from 'youtube-dl';
import ytdl, { validateURL, videoFormat as VideoFormat, videoInfo as VideoInfo } from 'ytdl-core';

// constants
const CANCEL_TIMEOUT_MS = 10000;
const CLEANUP_INTERVAL_MS = 1000 * 60 * 10; // 10 minutes
const HTTP_REGEX = /^https?:\/\//;
const MAX_URL_LENGTH = 2000;
const MAX_VIDEO_AGE = 1000 * 60 * 60 * 2; // 2 hours
const RESOLUTIONS = [
  '480',
  '720',
  '1080',
  '2160'
];

class Video {
  private cancelTimeout: null | NodeJS.Timeout = null;
  complete: () => void;
  private download: Readable;
  downloadAudio: null | Readable = null;
  extension: string;
  id: string;
  isYoutube: boolean;
  logger: Logger;
  progress = 0;
  progressAudio: null | number = null;
  startedAt = Date.now();
  status = VideoStatus.DOWNLOADING;
  title: string;

  get averageProgress() {
    if (this.progressAudio === null) {
      return this.progress;
    }

    return (this.progress + this.progressAudio) / 2;
  }

  constructor(id: string, download: Readable, title: string, extension: string, isYoutube: boolean) {
    this.download = download;
    this.title = title;
    this.extension = extension;
    this.id = id;
    this.isYoutube = isYoutube;

    this.logger = new Logger('video', {
      id
    });

    this.resetCancelTimeout();

    this.complete = after(this.isYoutube ? 2 : 1, () => {
      this._complete();
    });
  }

  private async _complete() {
    const path = `${DOWNLOAD_DIR}/${this.id}`;

    try {
      if (this.isYoutube) {
        this.status = VideoStatus.PROCESSING;
        this.logger.info('transcoding');
        await promisify(exec)(`ffmpeg -i ${path}.video -i ${path}.audio -c copy ${path}.mkv`);
        this.logger.info('transcoded');
      } else {
        // https://github.com/przemyslawpluta/node-youtube-dl/issues/309
        const { stdout } = await promisify(exec)(`file ${path}`);
        if (stdout.trim().endsWith('XML 1.0 document text, ASCII text')) {
          this.status = VideoStatus.ERROR;
          return;
        }
      }
    } catch (error) {
      this.logger.error('error during completion', {
        error
      });
      this.status = VideoStatus.ERROR;
      return;
    }

    this.status = VideoStatus.COMPLETE;
  }

  async cancel(reason: CancelReason) {
    if (this.status !== VideoStatus.DOWNLOADING) {
      return;
    }

    this.status = reason === CancelReason.USER ? VideoStatus.CANCELLED : VideoStatus.ERROR;
    this.clearCancelTimeout();
    this.download.destroy();
    this.downloadAudio?.destroy();

    try {
      if (this.isYoutube) {
        await Promise.all([
          fs.promises.unlink(`${DOWNLOAD_DIR}/${this.id}.audio`),
          fs.promises.unlink(`${DOWNLOAD_DIR}/${this.id}.video`)
        ]);
      } else {
        await fs.promises.unlink(`${DOWNLOAD_DIR}/${this.id}`);
      }
    } catch {
      // swallow
    } finally {
      this.logger.warn('cancelled', {
        reason
      });
    }
  }

  clearCancelTimeout() {
    if (this.cancelTimeout !== null) {
      clearTimeout(this.cancelTimeout);
      this.cancelTimeout = null;
    }
  }

  resetCancelTimeout() {
    this.clearCancelTimeout();
    this.cancelTimeout = setTimeout(() => this.cancel(CancelReason.TIMEOUT), CANCEL_TIMEOUT_MS);
  }
}

class HttpServer {
  private apiV1Router = express.Router();
  private app = express();
  private logger = new Logger('http-server');
  private requestId = 0;
  private videos = new Map<string, Video>();

  constructor() {
    this.configureExpress();
    this.start(httpPort);

    this.cleanUpDownloads();
    setInterval(this.cleanUpDownloads.bind(this), CLEANUP_INTERVAL_MS);
  }

  private async cleanUpDownloads() {
    const downloads = await fs.promises.readdir(DOWNLOAD_DIR);
    const downloadsToDelete = downloads.filter((filename) => {
      const id = parse(filename).name;
      const video = this.videos.get(id);
      return filename !== '.gitkeep' && (!video || Date.now() - video.startedAt < MAX_VIDEO_AGE);
    });

    for (const filename of downloadsToDelete) {
      this.logger.info('deleting file', {
        filename
      });
      this.videos.delete(filename);
      await fs.promises.unlink(`${DOWNLOAD_DIR}/${filename}`);
    }
  }

  private configureExpress() {
    this.app.use(express.static('frontend/dist'));
    this.app.use(express.json());

    this.app.use((req, res, next) => {
      res.locals.logger = Logger.wrapWithMetadata(this.logger, {
        requestId: ++this.requestId
      });
      res.locals.logger.info('request', {
        method: req.method,
        url: req.url
      });
      next();
    });
    this.app.use('/api/v1', this.apiV1Router);

    this.defineRoutes();
  }

  private defineRoutes() {
    this.app.get('/download/:videoId', async (req, res) => {
      try {
        const { videoId } = req.params;
        const video = this.videos.get(videoId);
        if (!video || video.status !== VideoStatus.COMPLETE) {
          res.sendStatus(404);
          return;
        }

        video.clearCancelTimeout();

        const { extension, isYoutube, title } = video;
        const path = `${DOWNLOAD_DIR}/${videoId}${isYoutube ? '.mkv' : ''}`;
        const stats = await fs.promises.stat(path);
        const safeTitle = removeAccents(title)
          // pretty arbitrary, just stolen from here:
          // https://github.com/deanylev/genius-quote-finder/blob/bfc9b5a8ac889c50f566b7ff05cd78eed092fb5d/start.ts#L138
          .replace(/[^0-9A-Za-z-_,.{}$[\]@()|&?!;/\\%#:<>+*^='"`~\s]/g, '')
          .trim();
        const filename = `${safeTitle}.${isYoutube ? 'mkv' : extension}`;
        res.setHeader('Content-Length', stats.size);
        res.setHeader('Content-Type', getType(filename) ?? 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        fs.createReadStream(path).pipe(res);
      } catch (error) {
        res.locals.logger.error('error while serving file', {
          error
        });
      }
    });

    this.apiV1Router.post('/download', (req, res) => {
      const { resolution, url } = req.body;
      if (
        typeof url !== 'string' || url.length > MAX_URL_LENGTH || !HTTP_REGEX.test(url)
        || typeof resolution !== 'string' || !RESOLUTIONS.includes(resolution)
      ) {
        res.sendStatus(400);
        return;
      }

      const trimmedUrl = url.trim();
      const id = v4();
      const isYoutube = validateURL(trimmedUrl);

      type ResolutionDimension = string | number | undefined;
      const formatResolution = (width: ResolutionDimension, height: ResolutionDimension) => {
        return width && height && `${width}x${height}` || 'Unknown';
      };

      res.locals.logger.info('download', {
        id,
        url: trimmedUrl,
        isYoutube
      });

      /**
       * ytdl-core is far faster at downloading but only supports YouTube videos
       * so we fall back to youtube-dl for all other websites
       */

      if (isYoutube) {
        const videoDownload = ytdl(trimmedUrl, {
          filter: (format) => {
            return !format.height || format.height <= parseInt(resolution, 10);
          },
          quality: 'highestvideo'
        });

        videoDownload.on('info', ({ videoDetails }: VideoInfo, format: VideoFormat) => {
          const video = new Video(id, videoDownload, videoDetails.title, format.container, true);
          this.videos.set(id, video);
          res.json({
            id,
            resolution: formatResolution(format.width, format.height),
            thumbnail: videoDetails.thumbnails[0].url,
            title: videoDetails.title
          });

          const audioDownload = ytdl(trimmedUrl, {
            ...isYoutube && {
              quality: 'highestaudio'
            }
          });
          video.downloadAudio = audioDownload;

          audioDownload.on('progress', (chunkLength, downloadedBytes, totalBytes) => {
            if (video) {
              video.progressAudio = downloadedBytes / totalBytes;
            }
          });

          audioDownload.on('error', (error) => {
            res.locals.logger.error('audio download error', {
              error
            });

            video?.cancel(CancelReason.ERROR_AUDIO);
          });

          audioDownload.on('end', () => {
            res.locals.logger.info('audio end');
            video?.complete();
          });

          audioDownload.pipe(fs.createWriteStream(`${DOWNLOAD_DIR}/${id}.audio`));
        });

        videoDownload.on('progress', (chunkLength, downloadedBytes, totalBytes) => {
          const video = this.videos.get(id);
          if (video) {
            video.progress = downloadedBytes / totalBytes;
          }
        });

        videoDownload.on('error', (error) => {
          res.locals.logger.error('video download error', {
            error
          });

          if (!res.headersSent) {
            res.sendStatus(400);
          }

          const video = this.videos.get(id);
          video?.cancel(CancelReason.ERROR_VIDEO);
        });

        videoDownload.on('end', () => {
          res.locals.logger.info('video download end');
          const video = this.videos.get(id);
          video?.complete();
        });

        videoDownload.pipe(fs.createWriteStream(`${DOWNLOAD_DIR}/${id}.video`));
      } else {
        const download = youtubedl(trimmedUrl, [], {
          cwd: __dirname,
          maxBuffer: Infinity as unknown as string // types enforce string values for some reason...
        });

        download.on('info', (info: { ext: string, height: number, size: number, thumbnail: string, title: string, width: number }) => {
          const video = new Video(id, download, info.title, info.ext, false);
          this.videos.set(id, video);
          res.json({
            id,
            resolution: formatResolution(info.width, info.height),
            thumbnail: info.thumbnail,
            title: info.title
          });

          download.on('data', (data) => {
            const video = this.videos.get(id);
            if (video) {
              video.progress = data.length / info.size;
            }
          });
        });

        download.on('error', (error) => {
          res.locals.logger.error('download error', {
            error
          });

          if (!res.headersSent) {
            res.sendStatus(400);
          }

          const video = this.videos.get(id);
          video?.cancel(CancelReason.ERROR);
        });

        download.on('end', () => {
          res.locals.logger.info('download end');
          const video = this.videos.get(id);
          video?.complete();
        });

        download.pipe(fs.createWriteStream(`${DOWNLOAD_DIR}/${id}`));
      }
    });

    this.apiV1Router.get('/poll/:videoId', (req, res) => {
      const { videoId } = req.params;
      const video = this.videos.get(videoId);
      if (!video) {
        res.sendStatus(404);
        return;
      }

      video.resetCancelTimeout();

      const { averageProgress, status } = video;
      if (status === VideoStatus.CANCELLED) {
        res.json({
          progress: 0,
          status
        });
        return;
      }

      res.json({
        progress: averageProgress,
        status
      });
    });

    this.apiV1Router.put('/cancel/:videoId', async (req, res) => {
      const { videoId } = req.params;
      const video = this.videos.get(videoId);
      if (!video) {
        res.sendStatus(404);
        return;
      }

      video.cancel(CancelReason.USER);
      res.sendStatus(204);
    });
  }

  private start(port: number) {
    const server = this.app.listen(port, () => {
      const address = server.address() as AddressInfo;
      this.logger.info('listening', {
        port: address.port
      });
    });
  }
}

export default new HttpServer();
