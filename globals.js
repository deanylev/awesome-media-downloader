// third party libraries
const commandExistsSync = require('command-exists').sync;

// globals
const VIDEO_FORMATS = ['mp4', 'mkv'];
const CONFIG_VARS = {
  ENV: 'production',
  PORT: 8080,
  DB_DUMP_INTERVAL: 3600000,
  FILE_DELETION_INTERVAL: 3600000,
  ALLOW_FORMAT_SELECTION: false,
  ALLOW_QUALITY_SELECTION: false,
  ENABLE_VP8: false,
  ADMIN_USERNAME: null,
  ADMIN_PASSWORD: null,
  HEROKU_APP_NAME: null,
  HEROKU_API_TOKEN: null,
  PROXY_HOST: null,
  SENTRY_URL: null
};

Object.keys(CONFIG_VARS).forEach((configVar) => module.exports[configVar] = process.env[configVar] || CONFIG_VARS[configVar]);

if (module.exports.ENABLE_VP8) {
  VIDEO_FORMATS.push('webm_video');
}

module.exports.DB_CREDS = {
  connectionLimit: 5,
  host: process.env.CLEARDB_DATABASE_URL || 'localhost',
  user: process.env.DATABASE_USER || 'root',
  password: process.env.DATABASE_PASSWORD || '',
  database: process.env.DATABASE_NAME || 'awesome_media_downloader'
};

module.exports.FILE_DIR = 'downloads';
module.exports.TMP_EXT = 'inprogress';
module.exports.FINAL_EXT = 'complete';
module.exports.VIDEO_FORMATS = VIDEO_FORMATS;
module.exports.AUDIO_FORMATS = ['mp3', 'wav', 'webm_audio'];
module.exports.FORMAT_GROUPS = {
  x264: ['mp4', 'mkv']
}
module.exports.FORMAT_ALIASES = Object.freeze({
  webm_video: 'webm',
  webm_audio: 'webm',
  vorbis: 'ogg'
});

module.exports.FFMPEG_OPTIONS = Object.freeze({
  mp4: {
    videoCodec: 'libx264'
  },
  mkv: {
    videoCodec: 'libx264'
  },
  webm_video: {
    videoCodec: 'libvpx'
  },
  mp3: {
    noVideo: '',
    audioBitrate: '192k',
    audioCodec: 'libmp3lame',
  },
  wav: {
    noVideo: '',
    audioFrequency: 44100,
    audioChannels: 2,
    audioCodec: 'pcm_s16le'
  },
  webm_audio: {
    noVideo: '',
    audioChannels: 2,
    audioCodec: 'libvorbis'
  },
  audio: {
    noVideo: '',
    audioChannels: 2,
    audioCodec: 'copy'
  },
  combine: {
    videoCodec: 'copy'
  }
});

module.exports.LOGGER_COLOURS = {
  log: 'blue',
  warn: 'yellow',
  error: 'red'
};

module.exports.LOGGER_MESSAGES = {
  log: [
    'dev mode, allowing any origin to access API',
    'started server on port',
    'client connected',
    'client disconnected',
    'downloading file',
    'file finished downloading',
    'transcoding to',
    'transcoding finished',
    'combining video and audio files',
    'providing file download',
    'successful admin login',
    'providing db download',
    'deleted db dump',
    'deleted all db dumps',
    'dumped database to file',
    'deleting unused files',
    'received download request',
    'client connected to admin socket',
    'set config var',
    'downloading audio track',
    'audio track finished downloading',
    'requested format is audio, requesting audio only',
    'extracting audio',
    'using proxy host',
    'identifying audio track format'
  ],
  warn: [
    'cancelling download',
    'killing ffmpeg',
    'admin login attempt'
  ],
  error: [
    'an error occured',
    'error while downloading file',
    'error when transcoding',
    'error when combining files',
    'port in use',
    'no audio track found'
  ]
};

module.exports.ALLOWED_CONFIG_KEYS = [
  'ALLOW_FORMAT_SELECTION',
  'ALLOW_QUALITY_SELECTION',
  'ALLOW_REQUESTED_NAME'
];

module.exports.ENVIRONMENT = {
  environment: module.exports.ENV,
  ffmpeg: commandExistsSync('ffmpeg'),
  onHeroku: !!module.exports.HEROKU_APP_NAME,
  allowFormatSelection: module.exports.ALLOW_FORMAT_SELECTION,
  allowQualitySelection: module.exports.ALLOW_QUALITY_SELECTION,
  videoFormats: module.exports.VIDEO_FORMATS,
  audioFormats: module.exports.AUDIO_FORMATS
};
