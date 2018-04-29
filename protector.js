const auth = require('basic-auth');
const crypto = require('crypto');
const Logger = require('./logger');

const ALGORITHM = 'aes-256-cbc';
const {
  ADMIN_USERNAME,
  ADMIN_PASSWORD
} = require('./globals');

const logger = new Logger();

function basicAuth(expressInstance, method, url, callback, log) {
  expressInstance[method](url, (req, res) => {
    let ipAddress = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    let credentials = auth(req);
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
}

function encryptString(string, key) {
  let cipher = crypto.createCipher(ALGORITHM, key);
  return `${cipher.update(string, 'utf8', 'hex')}${cipher.final('hex')}`;
}

function decryptString(string, key) {
  let decipher = crypto.createDecipher(ALGORITHM, key);
  try {
    return `${decipher.update(string, 'hex', 'utf8')}${decipher.final('utf8')}`;
  } catch (err) {
    return err;
  }
}

module.exports.basicAuth = basicAuth;
module.exports.encryptString = encryptString;
module.exports.decryptString = decryptString;
