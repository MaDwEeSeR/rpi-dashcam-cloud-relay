#!/bin/sh
set -eu

DIR=$(dirname "$0")

npm install
npm run build

sudo systemctl link ${DIR}/systemd/rpi-dashcam-fetch-fitcamx.service ${DIR}/systemd/rpi-dashcam-push-gcp-bucket.service
sudo systemctl enable ${DIR}/systemd/rpi-dashcam-fetch-fitcamx.service ${DIR}/systemd/rpi-dashcam-push-gcp-bucket.service
