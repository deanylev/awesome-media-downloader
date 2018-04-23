# Awesome Media Downloader

Awesome Media Downloader uses youtube-dl to download (and optionally ffmpeg to transcode) media from your favourite websites.

## Installing Locally

You must have Node.js installed (preferably the latest version) and optionally ffmpeg if you want transcoding to work (otherwise the format/quality selector will be hidden in the application).

### Running the backend

1. Run `npm install` once from the root of the repo to set up dependencies.
2. Run `npm start` from the root of the repo. The default port is 8080, but you can change this by setting the `PORT` env variable.
3. Set the `ENV` env variable to `development` if you intend to do work on the frontend (as this opens up the origin header).
4. Access the site at `http://localhost:PORT` where PORT is whatever you set the port to (the default being 8080).

### Running the frontend

When running in development mode, the frontend assumes the backend is running on port 8080. You can change this by setting the `SERVER_PORT` env variable.

1. Run `npm install` once from `/frontend` to set up dependencies.
2. Run `ember s` from `/frontend`.
3. Access the frontend at `http://localhost:4200`.

### Building the frontend

Run `/build_frontend.sh`. It will build the frontend and move the generated files to the correct places.

### Environment Variables

`PORT` - What port the backend will run on (default 8080)

`SERVER_PORT` - What port the frontend will try to access the backend on. This needs to be the same as `PORT`. (default 8080)

`ENV` - What environment the backend will run in. Either development or production. (default production)

`STATUS_INTERVAL` - How often the progress bar will update, in milliseconds. (default 1000)

`FILE_DELETION_INTERVAL` - How often video files will get deleted, in milliseconds. (default 3600000)

`DB_DUMP_INTERVAL` = How often the DB will be backed up to a file, in milliseconds. (default 3600000)

`ALLOW_FORMAT_SELECTION` - Whether to allow format selection on the frontend. (default false)

`ALLOW_QUALITY_SELECTION` - Whether to allow quality selection on the frontend. (default false)

`ALLOW_REQUESTED_NAME` - Whether to allow the user to name their files on the frontend. (default false)

`HEROKU_API_TOKEN` = The API token of the Heroku account, if running on Heroku. (default null)

`HEROKU_APP_NAME` = The name of the Heroku app, if running on Heroku. (default null)

`ADMIN_USERNAME`, `ADMIN_PASSWORD` - Credentials which will be allowed to access the admin area (/api/admin, just a list of downloads for now). (default null)
