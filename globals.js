let configVars = {
  ENV: 'production',
  PORT: 8080,
  DB_DUMP_INTERVAL: 3600000,
  FILE_DELETION_INTERVAL: 3600000,
  ALLOW_FORMAT_SELECTION: false,
  ALLOW_QUALITY_SELECTION: false,
  ALLOW_REQUESTED_NAME: false,
  ENABLE_VP8: false,
  ADMIN_USERNAME: null,
  ADMIN_PASSWORD: null,
  HEROKU_APP_NAME: null,
  HEROKU_API_TOKEN: null,
  PROXY_HOST: null,
  SENTRY_URL: null
};

Object.keys(configVars).forEach((configVar) => module.exports[configVar] = process.env[configVar] || configVars[configVar]);

let VIDEO_FORMATS = ['mp4', 'mkv'];
if (module.exports.ENABLE_VP8) {
  VIDEO_FORMATS.push('webm_video');
}

module.exports.DB_CREDS = {
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
