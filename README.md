# Awesome Media Downloader

Awesome Media Downloader uses youtube-dl to download (and optionally ffmpeg to convert) media from your favourite websites.

## Installing Locally

You must have Node.js installed (preferably the latest version) and optionally ffmpeg if you want converting to work (otherwise the format selector will be hidden in the application).

### Running the backend

1. Run `npm install` once from the root of the repo to setup dependencies.
2. Run `npm start` from the root of the repo. The default port is 8080, but you can change this by setting the `PORT` env variable.
3. Set the `ENV` env variable to `development` if you intend to do work on the frontend (as this opens up the origin header).
4. Access the site at `http://localhost:PORT` where PORT is whatever you set the port to (the default being 8080).

### Running the frontend

When running in development mode, the frontend assumes the backend is running on port 8080. You can change this by setting the `SERVER_PORT` env variable.

1. Run `npm install` once from `/frontend` to setup dependencies.
2. Run `ember s` from `/frontend`.
3. Access the frontend at `http://localhost:4200`.

### Building the frontend

Run `/build_frontend.sh`. It will build the frontend and move the generated files to the correct places.

### Environment Variables

`SERVER_PORT` - What port the backend will run on. (default 8080)

`ENV` - What environment the backend will run in. Either development or production. (default production)

`STATUS_INTERVAL` - How often the progress bar will update, in milliseconds. (default 1000)

`FILE_DELETION_INTERVAL` - How often video files will get deleted, in milliseconds. (default 3600000)

`TEMP_DELETION_INTERVAL` - How often incomplete downloads (.tmp/.tmpaudio files) will get deleted, in milliseconds. (default 86400000)

`ALLOW_FORMAT_SELECTION` - Whether to allow format selection on the frontend. (default false)

`ALLOW_QUALITY_SELECTION` - Whether to allow quality selection on the frontend. (default false)

`ADMIN_IPS` - Space-separated list of IPs which will be allowed to access the admin path (/api/admin, just a list of downloads for now). (default null)
