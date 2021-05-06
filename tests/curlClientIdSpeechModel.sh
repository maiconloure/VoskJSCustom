#!/bin/bash 

ipaddress="localhost"
port=3000

speechFile='"../audio/2830-3980-0043.wav"'
#model='"vosk-model-en-us-aspire-0.2"'
model='"vosk-model-small-en-us-0.15"'

# get unix timestamp in milliseconds, and use it as request id
id=$(($(date +%s%N)/1000000))

body='{"id":'$id',"speech":'$speechFile',"model":'$model'}'

curl \
--silent \
--header "Content-Type: application/json" \
--request POST \
--data $body \
http://$ipaddress:$port/transcript \
| python3 -m json.tool

