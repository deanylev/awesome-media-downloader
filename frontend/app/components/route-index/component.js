import Component from '@ember/component';
import config from '../../config/environment';
import $ from 'jquery';

const apiHost = config.APP.API_HOST;
const socket = io(config.APP.SOCKET_HOST);
const urlRegex = /(?:^|\s)((https?:\/\/)?(?:localhost|[\w-]+(?:\.[\w-]+)+)(:\d+)?(\/\S*)?)/;
const logColours = {
  log: 'blue',
  warn: 'orange',
  error: 'red'
};

export default Component.extend({
  urls: '',
  urlArray: Ember.computed('urls', function() {
    return this.get('urls').split('\n').map((url) => url.trim()).filter((url) => url && urlRegex.test(url));
  }),
  noUrls: Ember.computed.not('urlArray.length'),
  format: 'none',
  formats: null,
  formatLabels: {
    none: 'Original',
    audio: 'Original (Audio Only)',
    webm_video: 'WebM',
    webm_audio: 'WebM'
  },
  disableFormat: Ember.computed('inFlight', 'socketDisconnected', 'quality', function() {
    return this.get('inFlight') || this.get('socketDisconnected') || this.get('quality') !== 'none';
  }),
  quality: 'none',
  qualities: ['none', 'best'],
  qualityLabels: {
    none: 'Standard (recommended)',
    best: 'Best (takes much longer)'
  },
  disableQuality: Ember.computed('inFlight', 'socketDisconnected', 'format', function() {
    return this.get('inFlight') || this.get('socketDisconnected') || this.get('format') !== 'none';
  }),
  progress: 0,
  progressWidth: Ember.computed('downloadError', 'progress', function() {
    let progress;
    if (this.get('downloadError')) {
      progress = 100;
    } else {
      progress = this.get('progress');
    }
    return new Ember.String.htmlSafe(`width: ${progress}%`);
  }),
  displayedProgress: Ember.computed('progress', 'downloadError', function() {
    if (this.get('downloadError')) {
      return 'Error';
    } else if (this.get('progress')) {
      return `${this.get('progress')}%`;
    }
  }),
  inFlight: false,
  downloading: false,
  status: '',
  statusClass: 'dark',
  downloadError: false,
  environment: null,
  initialSocketConnection: false,
  socketConnected: false,
  socketDisconnected: Ember.computed.not('socketConnected'),
  documentReady: Ember.observer('initialSocketConnection', function() {
    setTimeout(() => {
      $('textarea').keyup(function(e) {
        while ($(this).outerHeight() < this.scrollHeight + parseFloat($(this).css('borderTopWidth')) + parseFloat($(this).css('borderBottomWidth'))) {
          $(this).height($(this).height() + 1);
        };
      });
    }, 10);
  }),

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
        this.set('formats', ['none', 'audio', {
            groupName: 'Video',
            options: details.videoFormats
          },
          {
            groupName: 'Audio',
            options: details.audioFormats
          },
        ]);
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
    });
  },

  actions: {
    setFormat(format) {
      this.set('format', format);
    },

    setQuality(quality) {
      this.set('quality', quality);
    },

    downloadFile() {
      return new Ember.RSVP.Promise((resolve, reject) => {
        let urls = [...this.get('urlArray')];
        let format = this.get('quality') === 'none' ? this.get('format') : '';
        let quality = this.get('format') === 'none' ? this.get('quality') : '';
        let totalFiles = urls.length;
        let fileNumber = 1;
        let fails = 0;
        let cancels = 0;

        socket.on('disconnect', reject);

        this.set('status', '');

        let downloadFile = () => {
          ['download error', 'file details', 'download progress', 'transcoding error', 'download cancelled'].forEach((listener) => {
            socket.off(listener);
          });

          if (!urls.length) {
            setTimeout(() => {
              this.set('inFlight', false);
              this.setStatus(`Downloading complete.${fails ? ` ${fails} file${fails === 1 ? ' was' : 's were'} unable to be downloaded.` : ''}${cancels ? ` ${cancels} download${cancels === 1 ? ' was' : 's were'} cancelled.` : ''}`);
              this.set('downloadError', false);
              this.set('progress', 0);
            }, 1500);

            socket.off('disconnect', reject);
            resolve();
            return;
          }

          socket.on('download error', () => {
            this.setStatus(`Sorry, looks like that URL isn't supported. (File ${fileNumber}/${totalFiles})`, 'danger');
            this.set('downloading', false);
            fileNumber++;
            fails++;
            downloadFile();
          });

          socket.on('transcoding error', () => {
            this.setStatus(`Error during processing. (File ${fileNumber - 1}/${totalFiles})`, 'danger');
            this.set('downloadError', true);
            this.set('inFlight', false);
            this.set('downloading', false);
            fails++;
            downloadFile();
          });

          socket.on('download cancelled', () => {
            this.setStatus(`Download cancelled. (File ${fileNumber - 1}/${totalFiles})`, 'danger');
            this.set('progress', 0);
            this.set('downloading', false);
            cancels++;
            downloadFile();
          });

          socket.on('file details', (details) => {
            this.set('downloadError', false);
            this.set('progress', 0);
            this.set('downloading', true);

            let fileStatus = `"${details.title}" (File ${fileNumber}/${totalFiles})`;
            this.setStatus(`Downloading ${fileStatus}`);

            fileNumber++;

            socket.on('download progress', (response) => {
              switch (response.status) {
                case 'complete':
                  this.set('progress', 100);
                  this.set('downloading', false);
                  window.location.href = `${apiHost}/download/${details.id}`;
                  downloadFile();
                  break;
                case 'transcoding':
                  this.setStatus(`Processing ${fileStatus}`);
                default:
                  this.set('progress', (response.progress * 100).toFixed(2));
              }
            });
          });

          let url = urls.shift();
          this.set('inFlight', true);

          socket.emit('download file', url, format, quality);
        }

        downloadFile();
      });
    },

    cancelDownload() {
      socket.emit('cancel download');
    }
  }
});
