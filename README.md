# Awesome Media Downloader

Awesome Media Downloader uses youtube-dl to download (and optionally ffmpeg to transcode) media from your favourite websites.

## Installing Locally

You must have Node.js installed (preferably the latest version), as well as Yarn and optionally ffmpeg if you want transcoding to work (otherwise the format/quality selector will be hidden in the application).

### Running the backend

1. Run `yarn` once from the root of the repo to set up dependencies.
2. Run `./install_hooks.sh` to install the necessary git hooks (only needed for development).
3. Run `npm start` from the root of the repo. The default port is 8080, but you can change this by setting the `PORT` env variable.
4. Set the `ENV` env variable to `development` if you intend to do work on the frontend (as this opens up the origin header).
5. Access the app at `http://localhost:PORT` where PORT is whatever you set the port to (the default being 8080).

### Running the frontend

When running in development mode, the frontend assumes the backend is running on port 8080. You can change this by setting the `SERVER_PORT` env variable.

1. Run `yarn` once from `/frontend` to set up dependencies.
2. Run `ember s` from `/frontend`.
3. Access the frontend at `http://localhost:4200`.

### Building the frontend

Run `/build_frontend.sh`. It will build the frontend and move the generated files to the correct places.

### Environment Variables

`PORT` - What port the backend will run on. (default 8080)

`SERVER_PORT` - What port the frontend will try to access the backend on. This needs to be the same as `PORT`. (default 8080)

`ENV` - What environment the backend will run in. Either development or production. (default production)

`DB_HOST` - MySQL host. (default 'localhost')

`DB_USER` - MySQL username. (default 'root')

`DB_PASS` - MySQL password. (default '')

`DB_NAME` - MySQL DB name. (default 'awesome_media_downloader')

`FILE_DELETION_INTERVAL` - How often video files will get deleted, in milliseconds. (default 3600000)

`DB_DUMP_INTERVAL` = How often the DB will be backed up to a file, in milliseconds. (default 3600000)

`ALLOW_FORMAT_SELECTION` - Whether to allow format selection on the frontend. (default false)

`ALLOW_VP8_FORMAT` - Enable VP8 video conversion as a user option. Off by default because it's extremely slow. (default false)

`ALLOW_QUALITY_SELECTION` - Whether to allow quality selection on the frontend. (default false)

`HEROKU_API_TOKEN` = The API token of the Heroku account, if running on Heroku. (default null)

`HEROKU_APP_NAME` = The name of the Heroku app, if running on Heroku. (default null)

`ADMIN_USERNAME`, `ADMIN_PASSWORD` - Credentials which will be allowed to access the admin area (/api/admin, just a list of downloads for now). (default null)

`PROXY_HOST` - Proxy host to pass into youtube-dl when downloading videos. (default null)

`SENTRY_URL` - URL for Sentry monitoring. (default null)
