import Component from '@ember/component';
import config from '../../config/environment';
import $ from 'jquery';

const apiHost = config.APP.API_HOST;

export default Component.extend({
  formats: {
    Video: ['mp4', 'mkv'],
    Audio: ['mp3', 'wav']
  },
  progress: 0,
  inFlight: false,
  responseWaiting: false,
  status: '',
  statusClass: 'dark',
  urls: '',
  downloadError: false,
  environment: null,

  init() {
    this._super(...arguments);
    $.getJSON(`${apiHost}/environment`).done((response) => {
      this.set('environment', response);
    }).fail((response) => {
      this.set('status', 'Failed to establish a backend connection.');
      this.set('statusClass', 'danger');
    });
  },

  actions: {
    downloadVideo() {
      if (!this.get('urls')) {
        this.set('status', 'Please enter at least one URL.');
        this.set('statusClass', 'danger');
        return;
      }

      if (this.get('inFlight')) {
        return;
      }

      let urls = this.get('urls').split('\n');
      let format = $('#format').val();
      let totalVideos = urls.length;
      let videoNumber = 1;
      let fails = 0;

      this.set('status', '');

      let downloadVideo = () => {
        if (!urls.length) {
          setTimeout(() => {
            this.set('inFlight', false);
            this.set('status', `Downloading complete.${fails ? ` ${fails} video${fails === 1 ? ' was' : 's were'} unable to be downloaded.` : ''}`);
            this.set('statusClass', 'dark');
            this.set('downloadError', false);
            this.set('progress', 0);
          }, 1500);

          return;
        }

        let url = urls.shift();
        this.set('inFlight', true);
        this.set('responseWaiting', true);

        $.ajax({
          dataType: 'json',
          method: 'POST',
          url: `${apiHost}/download`,
          data: {
            url,
            format
          },
          complete: () => {
            this.set('downloadError', false);
            this.set('progress', 0);
            this.set('responseWaiting', false);
            videoNumber++;
          },
          success: (response) => {
            let fileSize = response.fileSize;
            let fileName = encodeURIComponent(response.fileName);
            let tempFile = response.tempFile;
            let fileStatus = `"${response.fileName.slice(0, -(response.extension.length + 1))}" (Video ${videoNumber}/${totalVideos})`;
            this.set('status', `Downloading ${fileStatus}`);
            this.set('statusClass', 'dark');
            let checkStatus = setInterval(() => {
              $.getJSON(`${apiHost}/download_status`, {
                tempFile,
                fileSize
              }).done((response) => {
                switch (response.status) {
                  case 'complete':
                    this.set('progress', 100);
                    clearInterval(checkStatus);
                    window.location.href = `${apiHost}/download_file?video=${fileName}`;
                    downloadVideo();
                    break;
                  case 'transcoding':
                    this.set('status', `Converting ${fileStatus}`);
                    this.set('statusClass', 'dark');
                  default:
                    this.set('progress', (response.progress * 100).toFixed(2));
                }
              }).fail(() => {
                clearInterval(checkStatus);
                this.set('downloadError', true);
                this.set('progress', 100);
                this.set('inFlight', false);
              });
            }, this.get('environment').statusInterval);
          },
          error: (response) => {
            let error;
            if (response.status === 500) {
              error = `Sorry, looks like that URL isn't supported.`;
            } else {
              error = 'An error occured.';
            }
            this.set('status', `${error} (Video ${videoNumber}/${totalVideos})`);
            this.set('statusClass', 'danger');
            fails++;
            downloadVideo();
          }
        });
      }

      downloadVideo();
    }
  }
});
