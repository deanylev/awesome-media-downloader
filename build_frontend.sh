#!/bin/bash

(cd frontend; ember build --prod)
rm -r public
mv frontend/dist public
mv public/index.html views/pages/index.ejs
