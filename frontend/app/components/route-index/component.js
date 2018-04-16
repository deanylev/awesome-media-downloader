import Component from '@ember/component';
import config from '../../config/environment';
import $ from 'jquery';

const apiHost = config.APP.API_HOST;
const socket = io(config.APP.SOCKET_HOST);
const regexes = {
  url: /(?:^|\s)((https?:\/\/)?(?:localhost|[\w-]+(?:\.[\w-]+)+)(:\d+)?(\/\S*)?)/,
  email: /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
}

export default Component.extend({
  urls: '',
  urlArray: Ember.computed('urls', function() {
    return this.get('urls').split('\n').map((url) => url.trim()).filter((url) => url && regexes.url.test(url));
  }),
  noUrls: Ember.computed.not('urlArray.length'),
  format: 'none',
  formats: null,
  formatLabels: {
    'none': 'Original'
  },
  disableFormat: Ember.computed('inFlight', 'socketDisconnected', 'quality', function() {
    return this.get('inFlight') || this.get('socketDisconnected') || this.get('quality') !== 'none';
  }),
  quality: 'none',
  qualities: ['none', 'best'],
  qualityLabels: {
    'none': 'Standard (recommended)',
    'best': 'Best (takes much longer)'
  },
  disableQuality: Ember.computed('inFlight', 'socketDisconnected', 'format', function() {
    return this.get('inFlight') || this.get('socketDisconnected') || this.get('format') !== 'none';
  }),
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
  downloadError: false,
  environment: null,
  initialSocketConnection: false,
  socketConnected: false,
  socketDisconnected: Ember.computed.not('socketConnected'),
  getFileTitles: Ember.observer('urlArray', function() {
    if (this.get('environment.allowRequestedName')) {
      this.get('urlArray').forEach((url, index) => {
        socket.emit('file title', url, index);
      });
    }
  }),
  documentReady: Ember.observer('initialSocketConnection', function() {
    setTimeout(() => {
      $('textarea').keyup(function(e) {
        while ($(this).outerHeight() < this.scrollHeight + parseFloat($(this).css('borderTopWidth')) + parseFloat($(this).css('borderBottomWidth'))) {
          $(this).height($(this).height() + 1);
        };
      });
    }, 10);
  }),
  isAuthenticated: false,
  registering: false,
  registeringStatus: '',
  authenticating: false,
  email: '',
  password: '',
  passwordConfirmation: '',
  disableRegister: Ember.computed('email', 'password', 'passwordConfirmation', 'responseWaiting', function() {
    return !(regexes.email.test(this.get('email')) && this.get('password').length >= 8 && this.get('password') === this.get('passwordConfirmation') && !this.get('responseWaiting'));
  }),
  disableLogin: Ember.computed('email', 'password', 'passwordConfirmation', 'inFlight', function() {
    return !(regexes.email.test(this.get('email')) && this.get('password') && !this.get('responseWaiting'));
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
        this.set('formats', ['none', {
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
      this.set('responseWaiting', false);
    });

    socket.on('file title', (title, index) => {
      $(`#name-input-${index + 1}`).attr('placeholder', title);
    });

    //Ember.$.getJSON('/')
  },

  actions: {
    setFormat(format) {
      this.set('format', format);
    },

    setQuality(quality) {
      this.set('quality', quality);
    },

    toggleRegistering() {
      this.set('registeringStatus', '');
      if (!this.get('responseWaiting')) {
        this.toggleProperty('registering');
      }
    },

    toggleAuthenticating() {
      this.set('authenticatingStatus', '');
      if (!this.get('responseWaiting')) {
        this.toggleProperty('authenticating');
      }
    },

    register() {
      this.set('responseWaiting', true);
      $.ajax({
        method: 'POST',
        url: `${apiHost}/users/create`,
        data: {
          email: this.get('email'),
          password: this.get('password')
        },
        complete: (response) => {
          if (response.status === 200) {
            this.set('registering', false);
            this.set('email', '');
            this.set('password', '');
            this.set('passwordConfirmation', '');
          } else if (response.status === 409) {
            this.set('registeringStatus', 'An account with that email address already exists.');
          } else {
            this.set('registeringStatus', 'An error occured.');
          }
          this.set('responseWaiting', false);
        }
      });
    },

    authenticate() {
      this.set('responseWaiting', true);
      $.ajax({
        method: 'POST',
        url: `${apiHost}/users/authenticate`,
        data: {
          email: this.get('email'),
          password: this.get('password')
        },
        complete: (response) => {
          if (response.status === 200) {
            this.set('authenticating', false);
            this.set('email', '');
            this.set('password', '');
          } else if (response.status === 401) {
            this.set('authenticatingStatus', 'Invalid credentials.');
          } else {
            this.set('authenticatingStatus', 'An error occured.');
          }
          this.set('responseWaiting', false);
        }
      });
    },

    unAuthenticate() {
      this.set('authenticated', false);
    },

    downloadFile() {
      if (this.get('inFlight') || this.get('socketDisconnected')) {
        return;
      }

      let urls = [];
      this.get('urlArray').forEach((url) => {
        urls.push(url);
      });

      let format = this.get('quality') === 'none' ? this.get('format') : '';
      let quality = this.get('format') === 'none' ? this.get('quality') : '';
      let totalFiles = urls.length;
      let fileNumber = 1;
      let fails = 0;

      if (!urls.length) {
        this.setStatus('Please enter at least one URL.', 'danger');
        return;
      }

      this.set('status', '');

      let downloadFile = () => {
        ['download error', 'file details', 'download progress', 'transcoding error'].forEach((listener) => {
          socket.off(listener);
        });

        if (!urls.length) {
          setTimeout(() => {
            this.set('inFlight', false);
            this.setStatus(`Downloading complete.${fails ? ` ${fails} file${fails === 1 ? ' was' : 's were'} unable to be downloaded.` : ''}`);
            this.set('downloadError', false);
            this.set('progress', 0);
          }, 1500);

          return;
        }

        socket.on('download error', () => {
          this.setStatus(`Sorry, looks like that URL isn't supported. (File ${fileNumber}/${totalFiles})`, 'danger');
          this.set('responseWaiting', false);
          fileNumber++;
          fails++;
          downloadFile();
        });

        socket.on('transcoding error', () => {
          this.setStatus(`Error during conversion. (File ${fileNumber - 1}/${totalFiles})`, 'danger');
          this.set('downloadError', true);
          this.set('inFlight', false);
          fails++;
          downloadFile();
        });

        socket.on('file details', (details) => {
          this.set('downloadError', false);
          this.set('progress', 0);
          this.set('responseWaiting', false);

          let id = details.id;
          let fileStatus = `"${details.fileName}" (File ${fileNumber}/${totalFiles})`;
          this.setStatus(`Downloading ${fileStatus}`);

          fileNumber++;

          socket.on('download progress', (data) => {
            switch (data.status) {
              case 'complete':
                this.set('progress', 100);
                window.location.href = `${apiHost}/download_file/${id}`;
                downloadFile();
                break;
              case 'transcoding':
                this.setStatus(`Processing ${fileStatus}`);
              default:
                this.set('progress', (data.progress * 100).toFixed(2));
            }
          });
        });

        let url = urls.shift();
        this.set('inFlight', true);
        this.set('responseWaiting', true);

        socket.emit('download file', url, format, quality, $(`#name-input-${fileNumber}`).val());
      }

      downloadFile();
    }
  }
});
