#!/bin/bash

(cd frontend; ember build --prod)
rm views/pages/index.ejs
rm -r public/assets
rm -r public/fonts
mv frontend/dist/index.html views/pages/index.ejs
mv frontend/dist/assets public/assets
mv frontend/dist/fonts public/fonts
