module.exports.DB_CREDS = {
  host: process.env.CLEARDB_DATABASE_URL || 'localhost',
  user: process.env.DATABASE_USER || 'root',
  password: process.env.DATABASE_PASSWORD || '',
  database: process.env.DATABASE_NAME || 'awesome_media_downloader'
};

module.exports.FILE_DIR = 'files';
module.exports.TMP_EXT = 'inprogress';
module.exports.FINAL_EXT = 'complete';
module.exports.VIDEO_FORMATS = ['mp4', 'mkv'];
module.exports.AUDIO_FORMATS = ['mp3', 'wav', 'webm'];

let configVars = {
  PORT: 8080,
  ENV: 'production',
  ALLOW_FORMAT_SELECTION: false,
  ALLOW_QUALITY_SELECTION: false,
  ALLOW_REQUESTED_NAME: false,
  ADMIN_USERNAME: null,
  ADMIN_PASSWORD: null,
  HEROKU_APP_NAME: null,
  HEROKU_API_TOKEN: null,
  DB_DUMP_INTERVAL: 3600000,
  FILE_DELETION_INTERVAL: 3600000
};

Object.keys(configVars).forEach((configVar) => module.exports[configVar] = process.env[configVar] || configVars[configVar]);
