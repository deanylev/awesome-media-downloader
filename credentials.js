module.exports.DbCreds = {
  host: process.env.CLEARDB_DATABASE_URL || 'localhost',
  user: process.env.DATABASE_USER || 'root',
  password: process.env.DATABASE_PASSWORD || '',
  database: process.env.DATABASE_NAME || 'awesome_media_downloader'
};
