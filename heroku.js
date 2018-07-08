// globals
const {
  HEROKU_API_TOKEN,
  HEROKU_APP_NAME,
  ALLOWED_CONFIG_KEYS
} = require('./globals');

// config
const Heroku = require('heroku-client');
const heroku = new Heroku({
  token: HEROKU_API_TOKEN
});

function restartDynos() {
  if (HEROKU_APP_NAME) {
    // Can't provide a response, since we're killing the process
    heroku.delete(`/apps/${HEROKU_APP_NAME}/dynos`);
  }
}

function setConfigVar(key, value) {
  if (ALLOWED_CONFIG_KEYS.includes(key)) {
    const body = {};
    body[key] = value;
    return heroku.patch(`/apps/${HEROKU_APP_NAME}/config-vars`, {
      body
    });
  } else {
    return Promise.reject({
      err: 'forbidden key',
      key,
      value
    });
  }
}

Object.assign(module.exports, {
  restartDynos,
  setConfigVar
});
