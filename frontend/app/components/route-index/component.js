import Component from '@ember/component';
import config from '../../config/environment';
import $ from 'jquery';

const apiHost = config.APP.API_HOST;
const socket = io(config.APP.SOCKET_HOST);

export default Component.extend({
  formats: {
    Video: ['mp4', 'mkv'],
    Audio: ['mp3', 'wav']
  },
  progress: 0,
  displayedProgress: Ember.computed('progress', 'downloadError', function() {
    if (this.get('downloadError')) {
      return 'Error';
    } else if (this.get('progress')) {
      return `${this.get('progress')}%`;
    }
  }),
  inFlight: false,
  responseWaiting: false,
  status: '',
  statusClass: 'dark',
  urls: '',
  downloadError: false,
  environment: null,
  socketConnected: false,
  socketDisconnected: Ember.computed.not('socketConnected'),

  init() {
    this._super(...arguments);

    socket.on('connect', () => {
      this.set('socketConnected', true);
      this.set('status', '');

      socket.emit('environment check');

      socket.on('environment details', (details) => {
        this.set('environment', details);
      });

      this.set('downloadError', false);
      this.set('progress', 0);
    });

    socket.on('connect_error', (error) => {
      this.set('socketConnected', false);
      this.set('status', `Couldn't establish connection to backend socket. ${error}.`);
      this.set('statusClass', 'danger');
      if (this.get('inFlight')) {
        this.set('downloadError', true);
      }
      this.set('inFlight', false);
      this.set('responseWaiting', false);
    });
  },

  didInsertElement() {
    $('textarea').textareaAutoSize();
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

      socket.on('download error', () => {
        this.set('status', `Sorry, looks like that URL isn't supported. (Video ${videoNumber}/${totalVideos})`);
        this.set('statusClass', 'danger');
        this.set('responseWaiting', false);
        videoNumber++;
        fails++;
        downloadVideo();
      });

      socket.on('video details', (details) => {
        this.set('downloadError', false);
        this.set('progress', 0);
        this.set('responseWaiting', false);

        let id = details.id;
        let fileStatus = `"${details.fileName}" (Video ${videoNumber}/${totalVideos})`;
        this.set('status', `Downloading ${fileStatus}`);
        this.set('statusClass', 'dark');

        videoNumber++;

        socket.on('download progress', (response) => {
          switch (response.status) {
            case 'complete':
              this.set('progress', 100);
              window.location.href = `${apiHost}/download_file?id=${id}`;
              downloadVideo();
              break;
            case 'transcoding':
              this.set('status', `Converting ${fileStatus}`);
              this.set('statusClass', 'dark');
            default:
              this.set('progress', (response.progress * 100).toFixed(2));
          }
        });
      });

      socket.on('transcoding error', () => {
        this.set('downloadError', true);
        this.set('inFlight', false);
      });

      let downloadVideo = () => {
        if (!urls.length) {
          setTimeout(() => {
            this.set('inFlight', false);
            this.set('status', `Downloading complete.${fails ? ` ${fails} video${fails === 1 ? ' was' : 's were'} unable to be downloaded.` : ''}`);
            this.set('statusClass', 'dark');
            this.set('downloadError', false);
            this.set('progress', 0);

            ['download error', 'video details', 'download progress', 'transcoding error'].forEach((listener) => {
              socket.off(listener);
            });
          }, 1500);

          return;
        }

        let url = urls.shift();
        this.set('inFlight', true);
        this.set('responseWaiting', true);

        socket.emit('download video', url, format);
      }

      downloadVideo();
    }
  }
});
