# syntax=docker/dockerfile:1.6

# https://askubuntu.com/questions/972516/debian-frontend-environment-variable
ARG DEBIAN_FRONTEND=noninteractive

ARG BASE_IMAGE=debian:11
ARG SLIM_BASE=debian:11-slim

FROM ${BASE_IMAGE} AS base

FROM --platform=${BUILDPLATFORM} debian:11 AS base_host

FROM ${SLIM_BASE} AS slim-base

FROM slim-base AS wget
ARG DEBIAN_FRONTEND
RUN apt-get update \
    && apt-get install -y wget xz-utils \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /rootfs

FROM base AS nginx
ARG DEBIAN_FRONTEND
ENV CCACHE_DIR /root/.ccache
ENV CCACHE_MAXSIZE 2G

# bind /var/cache/apt to tmpfs to speed up nginx build
RUN --mount=type=tmpfs,target=/tmp --mount=type=tmpfs,target=/var/cache/apt \
    --mount=type=bind,source=docker/main/build_nginx.sh,target=/deps/build_nginx.sh \
    --mount=type=cache,target=/root/.ccache \
    /deps/build_nginx.sh

FROM scratch AS go2rtc
ARG TARGETARCH
WORKDIR /rootfs/usr/local/go2rtc/bin
ADD --link --chmod=755 "https://github.com/AlexxIT/go2rtc/releases/download/v1.9.2/go2rtc_linux_${TARGETARCH}" go2rtc

FROM wget AS tempio
ARG TARGETARCH
RUN --mount=type=bind,source=docker/main/install_tempio.sh,target=/deps/install_tempio.sh \
    /deps/install_tempio.sh

####
#
# OpenVino Support
#
# 1. Download and convert a model from Intel's Public Open Model Zoo
#
####
# Download and Convert OpenVino model
FROM base_host AS ov-converter
ARG DEBIAN_FRONTEND

# Install OpenVino Runtime and Dev library
COPY docker/main/requirements-ov.txt /requirements-ov.txt
RUN apt-get -qq update \
    && apt-get -qq install -y wget python3 python3-dev python3-distutils gcc pkg-config libhdf5-dev \
    && wget -q https://bootstrap.pypa.io/get-pip.py -O get-pip.py \
    && python3 get-pip.py "pip" \
    && pip install -r /requirements-ov.txt
    
# Get OpenVino Model
RUN --mount=type=bind,source=docker/main/build_ov_model.py,target=/build_ov_model.py \
    mkdir /models && cd /models \
    && wget http://download.tensorflow.org/models/object_detection/ssdlite_mobilenet_v2_coco_2018_05_09.tar.gz \
    && tar -xvf ssdlite_mobilenet_v2_coco_2018_05_09.tar.gz \
    && python3 /build_ov_model.py

FROM wget AS models

# Get model and labels
RUN wget -qO edgetpu_model.tflite https://github.com/google-coral/test_data/raw/release-frogfish/ssdlite_mobiledet_coco_qat_postprocess_edgetpu.tflite
RUN wget -qO cpu_model.tflite https://github.com/google-coral/test_data/raw/release-frogfish/ssdlite_mobiledet_coco_qat_postprocess.tflite
COPY labelmap.txt .
# Copy OpenVino model
COPY --from=ov-converter /models/ssdlite_mobilenet_v2.xml openvino-model/
COPY --from=ov-converter /models/ssdlite_mobilenet_v2.bin openvino-model/
RUN wget -q https://github.com/openvinotoolkit/open_model_zoo/raw/master/data/dataset_classes/coco_91cl_bkgr.txt -O openvino-model/coco_91cl_bkgr.txt && \
    sed -i 's/truck/car/g' openvino-model/coco_91cl_bkgr.txt
# Get Audio Model and labels
RUN wget -qO - https://www.kaggle.com/api/v1/models/google/yamnet/tfLite/classification-tflite/1/download | tar xvz && mv 1.tflite cpu_audio_model.tflite 
COPY audio-labelmap.txt .


FROM wget AS s6-overlay
ARG TARGETARCH
RUN --mount=type=bind,source=docker/main/install_s6_overlay.sh,target=/deps/install_s6_overlay.sh \
    /deps/install_s6_overlay.sh


FROM base AS wheels
ARG DEBIAN_FRONTEND
ARG TARGETARCH

# Use a separate container to build wheels to prevent build dependencies in final image
RUN apt-get -qq update \
    && apt-get -qq install -y \
    apt-transport-https \
    gnupg \
    wget \
    # the key fingerprint can be obtained from https://ftp-master.debian.org/keys.html
    && wget -qO- "https://keyserver.ubuntu.com/pks/lookup?op=get&search=0xA4285295FC7B1A81600062A9605C66F00D6C9793" | \
    gpg --dearmor > /usr/share/keyrings/debian-archive-bullseye-stable.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/debian-archive-bullseye-stable.gpg] http://deb.debian.org/debian bullseye main contrib non-free" | \
    tee /etc/apt/sources.list.d/debian-bullseye-nonfree.list \
    && apt-get -qq update \
    && apt-get -qq install -y \
    python3.9 \
    python3.9-dev \
    # opencv dependencies
    build-essential cmake git pkg-config libgtk-3-dev \
    libavcodec-dev libavformat-dev libswscale-dev libv4l-dev \
    libxvidcore-dev libx264-dev libjpeg-dev libpng-dev libtiff-dev \
    gfortran openexr libatlas-base-dev libssl-dev\
    libtbb2 libtbb-dev libdc1394-22-dev libopenexr-dev \
    libgstreamer-plugins-base1.0-dev libgstreamer1.0-dev \
    # scipy dependencies
    gcc gfortran libopenblas-dev liblapack-dev && \
    rm -rf /var/lib/apt/lists/*

# Ensure python3 defaults to python3.9
RUN update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.9 1

RUN wget -q https://bootstrap.pypa.io/get-pip.py -O get-pip.py \
    && python3 get-pip.py "pip"

COPY docker/main/requirements.txt /requirements.txt
RUN pip3 install -r /requirements.txt

COPY docker/main/requirements-wheels.txt /requirements-wheels.txt
RUN pip3 wheel --wheel-dir=/wheels -r /requirements-wheels.txt
# RUN pip3 install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118


# Collect deps in a single layer
FROM scratch AS deps-rootfs
COPY --from=nginx /usr/local/nginx/ /usr/local/nginx/
COPY --from=go2rtc /rootfs/ /
COPY --from=tempio /rootfs/ /
COPY --from=s6-overlay /rootfs/ /
COPY --from=models /rootfs/ /
COPY docker/main/rootfs/ /


# Vigision deps (ffmpeg, python, nginx, go2rtc, s6-overlay, etc)
FROM slim-base AS deps
ARG TARGETARCH

ARG DEBIAN_FRONTEND
# http://stackoverflow.com/questions/48162574/ddg#49462622
ARG APT_KEY_DONT_WARN_ON_DANGEROUS_USAGE=DontWarn

# https://github.com/NVIDIA/nvidia-docker/wiki/Installation-(Native-GPU-Support)
ENV NVIDIA_VISIBLE_DEVICES=all
ENV NVIDIA_DRIVER_CAPABILITIES="compute,video,utility"

ENV PATH="/usr/lib/btbn-ffmpeg/bin:/usr/local/go2rtc/bin:/usr/local/tempio/bin:/usr/local/nginx/sbin:${PATH}"

# Install dependencies
RUN --mount=type=bind,source=docker/main/install_deps.sh,target=/deps/install_deps.sh \
    /deps/install_deps.sh

RUN --mount=type=bind,from=wheels,source=/wheels,target=/deps/wheels \
    python3 -m pip install --upgrade pip && \
    pip3 install -U /deps/wheels/*.whl

COPY --from=deps-rootfs / /

EXPOSE 5000
EXPOSE 8554
EXPOSE 8555/tcp 8555/udp

# Configure logging to prepend timestamps, log to stdout, keep 0 archives and rotate on 10MB
ENV S6_LOGGING_SCRIPT="T 1 n0 s10000000 T"
# Do not fail on long-running download scripts
ENV S6_CMD_WAIT_FOR_SERVICES_MAXTIME=0

ENTRYPOINT ["/init"]
CMD []

HEALTHCHECK --start-period=120s --start-interval=5s --interval=15s --timeout=5s --retries=3 \
    CMD curl --fail --silent --show-error http://127.0.0.1:5000/api/version || exit 1

# Vigision deps with Node.js and NPM for devcontainer
FROM deps AS devcontainer

# Do not start the actual Vigision service on devcontainer as it will be started by VSCode
# But start a fake service for simulating the logs
COPY docker/main/fake_vigision_run /etc/s6-overlay/s6-rc.d/vigision/run

# Create symbolic link to the vigision source code, as go2rtc's create_config.sh uses it
RUN mkdir -p /opt/vigision \
    && ln -svf /workspace/vigision/vigision /opt/vigision/vigision

# Install Node 20
RUN curl -SLO https://deb.nodesource.com/nsolid_setup_deb.sh && \
    chmod 500 nsolid_setup_deb.sh && \
    ./nsolid_setup_deb.sh 20 && \
    apt-get install nodejs -y \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g npm@10

WORKDIR /workspace/vigision

RUN apt-get update \
    && apt-get install make -y \
    && rm -rf /var/lib/apt/lists/*
RUN apt-get update -y && apt-get install libgl1 -y

RUN --mount=type=bind,source=./docker/main/requirements-dev.txt,target=/workspace/vigision/requirements-dev.txt \
    pip3 install -r requirements-dev.txt

HEALTHCHECK NONE

CMD ["sleep", "infinity"]


# Vigision web build
# This should be architecture agnostic, so speed up the build on multiarch by not using QEMU.
FROM --platform=$BUILDPLATFORM node:20 AS web-build

WORKDIR /work
COPY web/package.json web/package-lock.json ./
RUN npm install

COPY web/ ./
RUN npm run build \
    && mv dist/BASE_PATH/monacoeditorwork/* dist/assets/ \
    && rm -rf dist/BASE_PATH

# Collect final files in a single layer
FROM scratch AS rootfs

WORKDIR /opt/vigision/
COPY vigision vigision/
COPY migrations migrations/
COPY --from=web-build /work/dist/ web/

# Vigision final container
FROM deps AS vigision

WORKDIR /opt/vigision/
COPY --from=rootfs / /
