#!/bin/sh
set -eu

DIR=$(dirname "$0")

npm install
npm run build

sudo systemctl link ${DIR}/systemd/rpi-dashcam-cloud-relay.service
sudo systemctl enable ${DIR}/systemd/rpi-dashcam-cloud-relay.service
