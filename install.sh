#!/bin/sh
set -eu

DIR=$(dirname "$0")

npm install
npm run build

systemctl link /${DIR}/systemd/rpi-dashcam-cloud-relay.service
systemctl enable /opt/${DIR}/systemd/rpi-dashcam-cloud-relay.service
