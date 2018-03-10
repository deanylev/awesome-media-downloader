# Awesome Media Downloader
Awesome Media Downloader uses youtube-dl to download (and optionally ffmpeg to convert) media from your favourite websites.

## Installing Locally
You must have Node.js installed (preferably the latest version) and optionally ffmpeg if you want converting to work (otherwise the format selector will be hidden in the application)

### Running the backend

1. Run `npm install` once from the root of the repo to setup dependencies. 
2. Run `npm start` from the root of the repo. The default port is 8080, but you can change this by setting the `PORT` env variable.
3. Set the `ENV` env variable to `development` if you intend to do work on the frontend (as this opens up the origin header).
4. Access the site at `http://localhost:PORT` where PORT is whatever you set the port to (the default being 8080).

### Running the frontend
When running in development mode, the frontend assumes the backend is at `http://localhost:8080`. You can change this in `/frontend/config/environment.js`.

1. Run `ember s` from `/frontend`.
2. Access the frontend at `http://localhost:4200`.

### Building the frontend

1. Run `npm install` once from `/frontend` to setup dependencies. 
2. Run `ember b --prod` from `/frontend`.
3. In `frontend/dist` copy `index.html` to `/pages/views` and rename it to `index.ejs` (replacing the existing file).
4. In `frontend/dist` copy `assets` and `fonts`, delete `assets and fonts` in `/public/` and paste the new folders in.
