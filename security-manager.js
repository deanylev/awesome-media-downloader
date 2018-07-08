// node libraries
const crypto = require('crypto');

// third party libraries
const auth = require('basic-auth');

// globals
const ALGORITHM = 'aes-256-cbc';
const {
  ADMIN_USERNAME,
  ADMIN_PASSWORD,
  ENCRYPTION_KEY
} = require('./globals');

// config
const Logger = require('./logger');
const logger = new Logger('security manager');

function SecurityManager(app) {
  this.app = app;
}

// public

SecurityManager.prototype.basicAuth = function(method, url, callback, log) {
  this.app[method](url, (req, res) => {
    const ipAddress = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const credentials = auth(req);
    if (ADMIN_USERNAME && ADMIN_PASSWORD && credentials && credentials.name === ADMIN_USERNAME && credentials.pass === ADMIN_PASSWORD) {
      if (log) {
        logger.log('successful admin login', {
          ipAddress,
          user: credentials.name
        });
      }
      callback(req, res);
    } else {
      res.setHeader('WWW-Authenticate', 'Basic realm="Admin area"');
      res.sendStatus(401);
      logger.warn('admin login attempt', {
        ipAddress,
        user: credentials ? credentials.name : ''
      });
    }
  });
};

SecurityManager.encryptString = (string) => {
  const cipher = crypto.createCipher(ALGORITHM, ENCRYPTION_KEY);
  return `${cipher.update(string, 'utf8', 'hex')}${cipher.final('hex')}`;
};

SecurityManager.decryptString = (string) => {
  const decipher = crypto.createDecipher(ALGORITHM, ENCRYPTION_KEY);
  try {
    return `${decipher.update(string, 'hex', 'utf8')}${decipher.final('utf8')}`;
  } catch (err) {
    return err;
  }
};

module.exports = SecurityManager;
