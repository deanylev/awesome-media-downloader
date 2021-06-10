import { action } from '@ember/object';
import { inject as service } from '@ember/service';
import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';

import ApiService from 'awesome-media-downloader/services/api';
import { VideoStatus } from 'awesome-media-downloader/lib/enums';
import sleep from 'awesome-media-downloader/lib/util/sleep';

const HTTP_REGEX = /^https?:\/\//;

class Video {
  id: string;
  @tracked progress = 0;
  resolution: string;
  @tracked status = VideoStatus.DOWNLOADING;
  thumbnail: string;
  title: string;
  url: string;

  constructor(id: string, url: string, thumbnail: string, title: string, resolution: string, status?: VideoStatus) {
    this.id = id;
    this.resolution = resolution;
    this.thumbnail = thumbnail;
    this.title = title;
    this.url = url;

    if (status) {
      this.status = status;
    }
  }

  get displayedProgress() {
    return `${(this.progress * 100).toFixed(2)}%`;
  }

  get displayedStatus() {
    switch (this.status) {
      case VideoStatus.CANCELLED:
        return 'Cancelled';
      case VideoStatus.COMPLETE:
        return 'Complete';
      case VideoStatus.ERROR:
        return 'Error';
      case VideoStatus.DOWNLOADING:
        return 'Downloading';
      case VideoStatus.INVALID:
        return 'Unsupported';
      case VideoStatus.PROCESSING:
        return 'Processing';
      default:
        return 'Unknown';
    }
  }

  get downloading() {
    return this.status === VideoStatus.DOWNLOADING;
  }

  get inFlight() {
    return [VideoStatus.DOWNLOADING, VideoStatus.PROCESSING].includes(this.status);
  }

  get invalid() {
    return this.status === VideoStatus.INVALID;
  }

  get notProcessing() {
    return this.status !== VideoStatus.PROCESSING;
  }
}

export default class RouteIndex extends Component {
  @service declare api: ApiService;

  @tracked inFlight = false;
  selectedResolution = '1080';
  @tracked urls = '';
  @tracked videos: Video[] = [];

  get disabled() {
    return !this.urls || this.inFlight;
  }

  @action
  cancel({ id }: Video) {
    return this.api.cancelDownload(id);
  }

  @action
  clear(video: Video) {
    this.videos.removeObject(video);
  }

  @action
  clearAll() {
    this.videos = [];
  }

  @action
  async download() {
    if (this.disabled) {
      return;
    }

    this.inFlight = true;

    const urls = this.urls
      .trim()
      .split('\n')
      .map((url) => url.trim())
      .filter((url) => url)
      .map((url) => HTTP_REGEX.test(url) ? url : `https://${url}`);

    for (const url of urls) {
      try {
        const { id, resolution, thumbnail, title } = await this.api.startDownload(url, this.selectedResolution);
        const video = new Video(id, url, thumbnail, title, resolution);
        this.videos.pushObject(video);

        while (true) {
          try {
            const { progress, status } = await this.api.pollDownload(id);
            video.progress = progress;
            video.status = status;

            if (status === VideoStatus.COMPLETE) {
              location.href = `/download/${id}`;
              break;
            } else if ([VideoStatus.CANCELLED, VideoStatus.ERROR, VideoStatus.INVALID].includes(status)) {
              break;
            }

            await sleep(1000);
          } catch {
            video.status = VideoStatus.ERROR;
            break;
          }
        }
      } catch (error) {
        this.videos.pushObject(new Video('', url, '', '', '', error === 400 ? VideoStatus.INVALID : VideoStatus.ERROR));
      }
    }

    this.inFlight = false;
  }

  @action
  handleResolutionChange(event: InputEvent) {
    this.selectedResolution = (event.target as HTMLSelectElement).value;
  }
}
