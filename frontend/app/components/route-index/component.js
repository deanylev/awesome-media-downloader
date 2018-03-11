import Component from '@ember/component';
import config from '../../config/environment';
import $ from 'jquery';

const apiHost = config.APP.API_HOST;
const socket = io(config.APP.SOCKET_HOST);
const urlRegex = /^(?:(?:https?|ftp):\/\/)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)(?:\.(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)*(?:\.(?:[a-z\u00a1-\uffff]{2,})))(?::\d{2,5})?(?:\/\S*)?$/;

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
  initialSocketConnection: false,
  socketConnected: false,
  socketDisconnected: Ember.computed.not('socketConnected'),

  setStatus(text, bsClass) {
    bsClass = bsClass || 'dark';
    this.set('status', text);
    this.set('statusClass', bsClass);
  },

  init() {
    this._super(...arguments);

    socket.on('connect', () => {
      this.set('socketConnected', true);
      this.set('status', '');

      socket.emit('environment check');

      socket.on('environment details', (details) => {
        this.set('environment', details);
        this.set('initialSocketConnection', true);
      });

      this.set('downloadError', false);
      this.set('progress', 0);
    });

    socket.on('connect_error', (error) => {
      this.set('initialSocketConnection', true);
      this.set('socketConnected', false);
      this.setStatus(`Couldn't establish connection to backend socket. ${error}.`, 'danger');
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
      let urls = this.get('urls').split('\n').map(url => url.trim()).filter(url => url && urlRegex.test(url));
      let format = $('#format').val();
      let totalVideos = urls.length;
      let videoNumber = 1;
      let fails = 0;

      if (!urls.length) {
        this.setStatus('Please enter at least one URL.', 'danger');
        return;
      }

      if (this.get('inFlight')) {
        return;
      }

      this.set('status', '');

      socket.on('download error', () => {
        this.setStatus(`Sorry, looks like that URL isn't supported. (Video ${videoNumber}/${totalVideos})`, 'danger');
        this.set('responseWaiting', false);
        videoNumber++;
        fails++;
        downloadVideo();
      });

      socket.on('transcoding error', () => {
        this.setStatus(`Error during conversion. (Video ${videoNumber - 1}/${totalVideos})`, 'danger');
        this.set('downloadError', true);
        this.set('inFlight', false);
        fails++;
        downloadVideo();
      });

      socket.on('video details', (details) => {
        this.set('downloadError', false);
        this.set('progress', 0);
        this.set('responseWaiting', false);

        let id = details.id;
        let fileStatus = `"${details.fileName}" (Video ${videoNumber}/${totalVideos})`;
        this.setStatus(`Downloading ${fileStatus}`);

        videoNumber++;

        socket.on('download progress', (response) => {
          switch (response.status) {
            case 'complete':
              this.set('progress', 100);
              window.location.href = `${apiHost}/download_file?id=${id}`;
              downloadVideo();
              break;
            case 'transcoding':
              this.setStatus(`Converting ${fileStatus}`);
            default:
              this.set('progress', (response.progress * 100).toFixed(2));
          }
        });
      });

      let downloadVideo = () => {
        if (!urls.length) {
          setTimeout(() => {
            this.set('inFlight', false);
            this.setStatus(`Downloading complete.${fails ? ` ${fails} video${fails === 1 ? ' was' : 's were'} unable to be downloaded.` : ''}`);
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
