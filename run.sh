#!/bin/sh
#docker run --net=host -it sound_machine
docker run --net=host --group-add audio -v $PWD:/project -it sound_machine
