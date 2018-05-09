const Heroku = require('heroku-client');

const {
  HEROKU_API_TOKEN,
  HEROKU_APP_NAME
} = require('./globals');

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
  let body = {};
  body[key] = value;
  return heroku.patch(`/apps/${HEROKU_APP_NAME}/config-vars`, {
    body
  });
}

module.exports.restartDynos = restartDynos;
module.exports.setConfigVar = setConfigVar;
