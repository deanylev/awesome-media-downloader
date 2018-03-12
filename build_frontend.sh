#!/bin/bash

(cd frontend; ember build --prod)
rm -r public/assets public/fonts
mv frontend/dist/index.html views/pages/index.ejs
mv frontend/dist/assets frontend/dist/fonts public
